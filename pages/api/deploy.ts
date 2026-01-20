import { NextApiRequest, NextApiResponse } from 'next';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { saveSettings } from '@/lib/settings-store';

// --- GLOBAL LOG STORAGE ---
declare global {
  var DEPLOY_LOGS: Record<string, { 
      status: string, 
      logs: string[], 
      installPath?: string, 
      creds?: { host: string, user: string, pass: string, path: string } 
  }>;
}
globalThis.DEPLOY_LOGS = globalThis.DEPLOY_LOGS || {};

// --- HELPER: GENERATE LAUNCHER SCRIPT ---
const createStartScript = (remotePath: string) => `#!/bin/bash
# Move to directory
cd "${remotePath}"

# 1. Clean up old logs
rm -f setup.log

# 2. Windows line endings for the main script
if [ -f "setup_env.sh" ]; then
    sed -i 's/\r$//' setup_env.sh
    chmod +x setup_env.sh
fi

# 3. Create placeholder log
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

        # Fallback: Try creating without pip (fixes Debian/Ubuntu issue)
        echo "[Polyfill] Standard creation failed. Retrying with --without-pip..." >> setup.log
        if python3 -m venv "$VENV_DIR" --without-pip >> setup.log 2>&1; then
            echo "[Polyfill] Venv created. Bootstrapping pip manually..." >> setup.log
            
            # Download get-pip.py
            if command -v curl &> /dev/null; then
                curl -fsS https://bootstrap.pypa.io/get-pip.py -o get-pip.py
            elif command -v wget &> /dev/null; then
                # Changed -o (log) to -O (output file)
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

# 4. Run python script in background
setsid nohup bash setup_env.sh . >> setup.log 2>&1 < /dev/null &

# 5. Small delay
sleep 2
echo "Launcher finished."
`;

// --- HELPER: RECURSIVE FILE GETTER ---
const getFiles = (dir: string, fileList: string[] = []) => {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    const IGNORED = [
      'trash', 
      '__pycache__', 
      'venv',          
      'node_modules',  
      '.git',          
      '.DS_Store',     
      'outputs'        
    ];

    if (IGNORED.includes(file) || file.startsWith('.') || file.endsWith('.pyc')) return;
    
    if (stat.isDirectory()) {
      getFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
};

// --- API HANDLER ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'GET') {
    const { jobId } = req.query;
    if (!jobId || typeof jobId !== 'string') return res.status(400).json({ error: "No Job ID" });
    const job = globalThis.DEPLOY_LOGS[jobId];
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (job.status === 'installing' && job.creds) {
       await checkRemoteLog(jobId, job);
    }
    // Mask credentials before sending to frontend
    const safeJob = { ...job, creds: undefined }; 
    return res.status(200).json(safeJob);
  }

  if (req.method === 'POST') {
    const { host, username, password, remotePath } = req.body;

    saveSettings({ remotePath, host, user: username });
    
    const jobId = `deploy_${Date.now()}`;
    const time = new Date().toLocaleTimeString();
    
    globalThis.DEPLOY_LOGS[jobId] = { 
        status: 'starting', 
        logs: [`[${time}] Initializing deployment...`],
        creds: { host, user: username, pass: password, path: remotePath }
    };
    
    res.status(200).json({ jobId });
    startBackgroundUpload(jobId, host, username, password, remotePath);
    return;
  }
}

// --- BACKGROUND WORKER ---
async function startBackgroundUpload(jobId: string, host: string, user: string, pass: string, remotePath: string) {
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

  const conn = new Client();

  conn.on('ready', () => {
    log('SSH Connected. Checking remote directory...');

    const allFiles = getFiles(localBackendPath);
    
    // 1. Create Base Directory
    conn.exec(`mkdir -p "${remotePath}"`, (err, stream) => {
        if (err) { log(`Mkdir Error: ${err.message}`); return; }
        stream.on('data', () => {}); 
        stream.on('close', () => {
            log("Directory ready. Starting SFTP upload...");
            
            conn.sftp((err, sftp) => {
                if (err) { log(`SFTP Error: ${err.message}`); return; }

                // 2. Upload Python Files
                uploadFiles(sftp, allFiles, localBackendPath, remotePath, log, () => {
                    
                    // 3. UPLOAD THE LAUNCHER SCRIPT
                    const startScriptContent = createStartScript(remotePath);
                    const startScriptPath = path.join(remotePath, 'start.sh').split(path.sep).join('/');
                    
                    const writeStream = sftp.createWriteStream(startScriptPath, { mode: 0o755 });
                    writeStream.end(startScriptContent);
                    
                    writeStream.on('close', () => {
                         log("Launcher script uploaded.");
                         triggerInstall(conn, remotePath, log, jobId);
                    });
                });
            });
        });
    });

  }).on('error', (err) => {
      log(`Connection Error: ${err.message}`);
      if(globalThis.DEPLOY_LOGS[jobId]) globalThis.DEPLOY_LOGS[jobId].status = 'error';
  }).connect({ host, port: 22, username: user, password: pass });
}

// --- HELPER: SFTP UPLOAD ---
function uploadFiles(sftp: any, files: string[], localRoot: string, remoteRoot: string, log: any, onDone: () => void) {
    let i = 0;
    const total = files.length;
    const uploadNext = () => {
        if (i >= total) {
            log("All files uploaded successfully.");
            onDone();
            return;
        }
        const localFile = files[i];
        const relative = path.relative(localRoot, localFile);
        const remoteFile = path.join(remoteRoot, relative).split(path.sep).join('/');
        
        sftp.mkdir(path.dirname(remoteFile), { attributes: {} }, () => {
            sftp.fastPut(localFile, remoteFile, (err: any) => {
                // Ignore transient errors, assume directory might exist
                if (err && i % 5 === 0) log(`Upload Info: ${relative}`);
                if (i % Math.ceil(total / 5) === 0) log(`Progress: ${Math.round((i / total) * 100)}%`);
                i++;
                uploadNext();
            });
        });
    };
    uploadNext();
}

// --- HELPER: TRIGGER INSTALL ---
function triggerInstall(conn: Client, remotePath: string, log: any, jobId: string) {
    log("Finalizing setup...");
    // Quoted path for safety
    const cmd = `bash "${remotePath}/start.sh"`;

    conn.exec(cmd, (err, stream) => {
        if (err) { log(`Launch Error: ${err.message}`); return; }
        stream.on('data', (d: any) => {}); 
        stream.on('close', () => {
             log("✅ Launcher finished. Switching to log monitor...");
             if (globalThis.DEPLOY_LOGS[jobId]) {
                 globalThis.DEPLOY_LOGS[jobId].status = 'installing';
             }
             conn.end();
        });
    });
}

// --- HELPER: CHECK REMOTE LOGS ---
async function checkRemoteLog(jobId: string, job: any) {
    return new Promise<void>((resolve) => {
        const conn = new Client();
        conn.on('ready', () => {
            // Quoted path to handle spaces in directory names
            conn.exec(`tail -n 20 "${job.creds.path}/setup.log"`, (err, stream) => {
                if (err) { conn.end(); resolve(); return; }
                let data = '';
                stream.on('data', (chunk: any) => { data += chunk; });
                stream.on('close', () => {
                    if (data) {
                        const lines = data.split('\n').filter(l => l.trim() !== '');
                        lines.forEach(line => {
                             if (!job.logs.some((existing: string) => existing.includes(line))) {
                                 job.logs.push(`[Remote] ${line}`);
                             }
                        });
                        
                        // Success Condition
                        if (data.includes("SETUP_COMPLETE_SIGNAL")) {
                            job.status = 'success';
                            job.installPath = job.creds.path;
                            delete job.creds; // Secure: Remove password from memory
                            job.logs.push("✅ Installation verified complete.");
                        }

                        // Error Condition
                        if (data.includes("CRITICAL ERROR") || data.includes("command not found") || data.includes("failed")) {
                            job.status = 'error';
                            job.logs.push("❌ Deployment Failed. Check logs above.");
                            delete job.creds; // Secure: Remove password from memory
                        }
                    }
                    conn.end();
                    resolve();
                });
            });
        }).on('error', () => { resolve(); }) 
          .connect({ 
             host: job.creds.host, 
             port: 22, 
             username: job.creds.user, 
             password: job.creds.pass 
          });
    });
}