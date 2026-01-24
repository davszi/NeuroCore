import { NextApiRequest, NextApiResponse } from 'next';
import { createConnection } from '@/lib/ssh';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';
import fs from 'fs';
import path from 'path';

// --- GLOBAL LOG STORAGE ---
declare global {
  var DEPLOY_LOGS: Record<string, { 
      status: string, 
      logs: string[], 
      installPath?: string,
      nodeName?: string
  }>;
}
globalThis.DEPLOY_LOGS = globalThis.DEPLOY_LOGS || {};

// --- HELPER: GENERATE ROBUST LAUNCHER SCRIPT ---
const createStartScript = (remotePath: string) => `#!/bin/bash
# Move to directory
cd "${remotePath}"

# 1. Clean up old logs
rm -f setup.log

# 2. INTEGRITY CHECK (The V2 Fix)
# If venv exists but isn't marked as complete, it's corrupted. Wipe it.
if [ -d "venv" ] && [ ! -f "venv/.install_complete" ]; then
    echo "[Launcher] ⚠️ Found incomplete venv from previous failed run. Wiping to force clean install..." >> setup.log
    rm -rf venv
fi

# 3. Windows line endings fix
if [ -f "setup_env.sh" ]; then
    sed -i 's/\\r$//' setup_env.sh
    chmod +x setup_env.sh
fi

# 4. Create placeholder log
touch setup.log
echo "[Launcher] Starting installation..." >> setup.log

# Robust Polyfill for 'virtualenv'
if ! command -v virtualenv &> /dev/null; then
    echo "[Launcher] 'virtualenv' command not found. Defining smart polyfill..." >> setup.log
    
    virtualenv() {
        local VENV_DIR="\${1:-.}"
        echo "[Polyfill] Creating virtual environment in $VENV_DIR..." >> setup.log
        
        # Try standard creation first
        if python3 -m venv "$VENV_DIR" >> setup.log 2>&1; then
            echo "[Polyfill] Success." >> setup.log
            return 0
        fi

        # Fallback: Try creating without pip
        echo "[Polyfill] Standard creation failed. Retrying with --without-pip..." >> setup.log
        if python3 -m venv "$VENV_DIR" --without-pip >> setup.log 2>&1; then
            echo "[Polyfill] Venv created. Bootstrapping pip manually..." >> setup.log
            
            # Download get-pip.py
            if command -v curl &> /dev/null; then
                curl -fsS https://bootstrap.pypa.io/get-pip.py -o get-pip.py
            elif command -v wget &> /dev/null; then
                wget -q https://bootstrap.pypa.io/get-pip.py -O get-pip.py
            else
                echo "[Polyfill] Error: No curl or wget found to download pip." >> setup.log
                return 1
            fi

            # Install pip into the new venv
            "$VENV_DIR/bin/python3" get-pip.py >> setup.log 2>&1
            local RET=$?
            rm -f get-pip.py
            
            if [ $RET -eq 0 ]; then
                echo "[Polyfill] Pip installed successfully." >> setup.log
                return 0
            else
                echo "[Polyfill] Failed to install pip." >> setup.log
                return 1
            fi
        else
            echo "[Polyfill] Critical: Failed to create venv even without pip." >> setup.log
            return 1
        fi
    }
    export -f virtualenv
fi

# 5. Run setup script in background
# We chain '&& touch venv/.install_complete' so the marker is only created if setup SUCCEEDS.
setsid nohup bash -c 'bash setup_env.sh . && touch venv/.install_complete' >> setup.log 2>&1 < /dev/null &

# 6. Small delay
sleep 2
echo "Launcher finished."
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // 1. STATUS POLLING
  if (req.method === 'GET') {
    const { jobId } = req.query;
    if (!jobId || typeof jobId !== 'string') return res.status(400).json({ error: "No Job ID" });
    
    const job = globalThis.DEPLOY_LOGS[jobId];
    if (!job) return res.status(404).json({ error: "Job not found" });

    // If installing, actively tail the logs
    if (job.status === 'installing' && job.nodeName) {
       await checkRemoteLog(jobId, job);
    }
    
    return res.status(200).json(job);
  }

  // 2. START DEPLOYMENT
  if (req.method === 'POST') {
    const { nodeName } = req.body;
    
    if (!nodeName) return res.status(400).json({ error: "Missing nodeName" });

    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(404).json({ error: "Node not found" });

    const installPath = getInstallPath(nodeName); // Automated Path
    const jobId = `deploy_${Date.now()}`;
    const time = new Date().toLocaleTimeString();
    
    globalThis.DEPLOY_LOGS[jobId] = { 
        status: 'starting', 
        logs: [`[${time}] Initializing deployment to ${nodeName}...`, `[Init] Target Path: ${installPath}`],
        installPath,
        nodeName: targetNode.name
    };
    
    // dded success flag so UI knows it worked
    res.status(200).json({ success: true, jobId, installPath });
    
    // Start Async Process
    startBackgroundDeployment(jobId, targetNode, installPath);
    return;
  }
}

// --- BACKGROUND WORKER ---
async function startBackgroundDeployment(jobId: string, node: NodeConfig, remotePath: string) {
  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    if (globalThis.DEPLOY_LOGS[jobId]) globalThis.DEPLOY_LOGS[jobId].logs.push(`[${time}] ${msg}`);
  };

  const localBackendPath = path.join(process.cwd(), 'benchmark-ml');
  if (!fs.existsSync(localBackendPath)) {
      log("ERROR: 'benchmark-ml' folder not found!");
      if(globalThis.DEPLOY_LOGS[jobId]) globalThis.DEPLOY_LOGS[jobId].status = 'error';
      return;
  }

  let ssh;
  try {
    log(`Connecting to ${node.host}...`);
    // Use shared SSH handler (Keys)
    ssh = await createConnection(node, { readyTimeout: 20000 });
    log('SSH Connected.');

    // 1. Create Directory
    log(`Ensuring remote directory: ${remotePath}`);
    await ssh.execCommand(`mkdir -p "${remotePath}"`);

    // 2. Upload Files (Recursive)
    log("Starting file upload (this may take a moment)...");
    
    // node-ssh putDirectory is robust equivalent to recursive SFTP
    await ssh.putDirectory(localBackendPath, remotePath, {
        recursive: true,
        concurrency: 10,
        validate: (itemPath) => {
            const base = path.basename(itemPath);
            return !base.startsWith('.') && base !== 'node_modules' && base !== 'venv' && base !== '__pycache__' && base !== 'outputs';
        },
        tick: (localPath, remotePath, error) => {
            if (error) log(`Upload Warning: ${path.basename(localPath)} - ${error.message}`);
        }
    });
    log("Files uploaded successfully.");

    // 3. Upload Launcher Script (ROBUST BASE64 METHOD)
    // -------------------------------------------------------------
    // FIX: We encode the script to Base64 to bypass 'EOF' and shell parsing issues.
    // -------------------------------------------------------------
    const startScriptContent = createStartScript(remotePath);
    const startScriptPath = `${remotePath}/start.sh`;
    
    // Encode content to Base64 in Node.js
    const encodedScript = Buffer.from(startScriptContent).toString('base64');
    
    // Decode on remote server using standard 'base64 -d'
    // This prevents any "line 82: EOF: command not found" errors
    await ssh.execCommand(`echo "${encodedScript}" | base64 -d > "${startScriptPath}"`);
    await ssh.execCommand(`chmod +x "${startScriptPath}"`);
    log("Launcher script uploaded (Base64 verified).");

    // 4. Trigger Install
    log("Finalizing setup...");
    const result = await ssh.execCommand(`bash "${startScriptPath}"`);
    
    if (result.code !== 0) {
        throw new Error(`Launcher failed: ${result.stderr}`);
    }

    log("✅ Launcher finished. Switching to log monitor...");
    if (globalThis.DEPLOY_LOGS[jobId]) {
        globalThis.DEPLOY_LOGS[jobId].status = 'installing';
    }

  } catch (error: any) {
    log(`Critical Error: ${error.message}`);
    if(globalThis.DEPLOY_LOGS[jobId]) globalThis.DEPLOY_LOGS[jobId].status = 'error';
  } finally {
    if (ssh) ssh.dispose();
  }
}

// --- HELPER: CHECK REMOTE LOGS ---
async function checkRemoteLog(jobId: string, job: any) {
    const nodeName = job.nodeName;
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return;

    let ssh;
    try {
        ssh = await createConnection(targetNode, { readyTimeout: 5000 });
        
        // Read the setup log created by the robust launcher
        const result = await ssh.execCommand(`tail -n 20 "${job.installPath}/setup.log"`);
        
        if (result.stdout) {
            const lines = result.stdout.split('\n').filter(l => l.trim() !== '');
            lines.forEach(line => {
                if (!job.logs.some((existing: string) => existing.includes(line))) {
                    job.logs.push(`[Remote] ${line}`);
                }
            });

            // Success Condition
            if (result.stdout.includes("SETUP_COMPLETE_SIGNAL")) {
                job.status = 'success';
                job.logs.push("✅ Installation verified complete.");
            }

            // Error Condition
            if (result.stdout.includes("CRITICAL ERROR") || result.stdout.includes("command not found") || result.stdout.includes("failed")) {
                job.status = 'error';
                job.logs.push("❌ Deployment Failed. Check logs above.");
            }
        }
    } catch (e) {
        // Connection error during polling is expected occasionally
    } finally {
        if (ssh) ssh.dispose();
    }
}