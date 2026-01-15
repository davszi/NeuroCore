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
// We create this file on the fly to ensure exact Linux syntax
const createStartScript = (remotePath: string) => `#!/bin/bash
# Move to directory
cd "${remotePath}"

# 1. Clean up old logs
rm -f setup.log

# 2. Fix Windows line endings for the main script
sed -i 's/\\r$//' setup_env.sh
chmod +x setup_env.sh

# 3. Create placeholder log to ensure file exists
touch setup.log
echo "[Launcher] Starting installation..." >> setup.log

# 4. Run python script in background (Detached)
# We use setsid to force a new session, ensuring it survives disconnect
setsid nohup bash setup_env.sh . >> setup.log 2>&1 < /dev/null &

# 5. Small delay to ensure process starts
sleep 2
echo "Launcher finished."
`;

// --- HELPER: RECURSIVE FILE GETTER ---
const getFiles = (dir: string, fileList: string[] = []) => {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    const IGNORED = [
      'trash', 
      '__pycache__', 
      'venv',          // Don't upload local python env
      'node_modules',  // Don't upload node modules
      '.git',          // Don't upload git history
      '.DS_Store',     // Mac metadata
      'outputs'        // Don't upload local experiment results
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
    conn.exec(`mkdir -p ${remotePath}`, (err, stream) => {
        if (err) { log(`Mkdir Error: ${err.message}`); return; }
        stream.on('data', () => {}); 
        stream.on('close', () => {
            log("Directory ready. Starting SFTP upload...");
            
            conn.sftp((err, sftp) => {
                if (err) { log(`SFTP Error: ${err.message}`); return; }

                // 2. Upload Python Files
                uploadFiles(sftp, allFiles, localBackendPath, remotePath, log, () => {
                    
                    // 3. UPLOAD THE LAUNCHER SCRIPT (The Fix)
                    const startScriptContent = createStartScript(remotePath);
                    const startScriptPath = path.join(remotePath, 'start.sh').split(path.sep).join('/');
                    
                    // Write the script directly to the server stream
                    const writeStream = sftp.createWriteStream(startScriptPath);
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
                if (err && i % 5 === 0) log(`Upload Warning: ${relative}`);
                if (i % Math.ceil(total / 5) === 0) log(`Progress: ${Math.round((i / total) * 100)}%`);
                i++;
                uploadNext();
            });
        });
    };
    uploadNext();
}

// --- HELPER: TRIGGER INSTALL (Simple Execution) ---
function triggerInstall(conn: Client, remotePath: string, log: any, jobId: string) {
    log("Finalizing setup...");

    // The script 'start.sh' is already on the server. We just run it.
    // This mimics YOU typing it in the terminal.
    const cmd = `bash ${remotePath}/start.sh`;

    conn.exec(cmd, (err, stream) => {
        if (err) { log(`Launch Error: ${err.message}`); return; }

        stream.on('data', (d: any) => {}); // Consume output
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
            conn.exec(`tail -n 15 ${job.creds.path}/setup.log`, (err, stream) => {
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
                        if (data.includes("SETUP_COMPLETE_SIGNAL")) {
                            job.status = 'success';
                            job.installPath = job.creds.path;
                            delete job.creds; 
                            job.logs.push("✅ Installation verified complete.");
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