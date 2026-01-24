import fs from 'fs';
import path from 'path';
import { NodeSSH } from 'node-ssh';
import { createConnection } from './ssh';
import { CLUSTER_NODES, getInstallPath } from './config';

const HISTORY_DIR = path.join(process.cwd(), 'data/ml-history');

// Ensure base folder exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

export async function syncNodeBenchmarks(nodeName: string) {
  const node = CLUSTER_NODES.find(n => n.name === nodeName);
  if (!node || !node.hasGpu) return;

  const localNodeDir = path.join(HISTORY_DIR, nodeName);
  if (!fs.existsSync(localNodeDir)) fs.mkdirSync(localNodeDir, { recursive: true });

  let ssh: NodeSSH | null = null;
  try {
    // 1. Get list of finished runs on remote
    ssh = await createConnection(node);
    const installPath = getInstallPath(nodeName);
    const cmd = `find ${installPath}/outputs -mindepth 2 -maxdepth 2 -name "run_metrics.jsonl"`;
    
    const result = await ssh.execCommand(cmd);
    if (!result.stdout) return;

    const remotePaths = result.stdout.trim().split('\n').filter(Boolean);

    // 2. Compare with local
    for (const remoteFile of remotePaths) {

      const parts = remoteFile.split('/');
      const runId = parts[parts.length - 2];

      const localRunDir = path.join(localNodeDir, runId);
      const localSuccessFile = path.join(localRunDir, 'run_metrics.jsonl');
      if (fs.existsSync(localSuccessFile)) continue;

      console.log(`[Sync] ⬇️ Downloading new/incomplete run ${runId} from ${nodeName}...`);
      
      if (!fs.existsSync(localRunDir)) {
          fs.mkdirSync(localRunDir, { recursive: true });
      }

      // 3. Download the 3 key files
      const remoteRunDir = path.dirname(remoteFile);
      
      try {
          // We use Promise.all to download in parallel for speed
          await Promise.all([
             ssh.getFile(path.join(localRunDir, 'config.json'), `${remoteRunDir}/config.json`).catch(() => {}),
             ssh.getFile(path.join(localRunDir, 'run_metrics.jsonl'), `${remoteRunDir}/run_metrics.jsonl`),
             ssh.getFile(path.join(localRunDir, 'step_metrics.jsonl'), `${remoteRunDir}/step_metrics.jsonl`).catch(() => {})
          ]);
          
          console.log(`[Sync] ✅ Synced ${runId} successfully.`);
      } catch (err) {
          console.error(`[Sync] Failed to download ${runId}:`, err);
          if (fs.existsSync(localRunDir)) {
             fs.rmSync(localRunDir, { recursive: true, force: true });
          }
      }
    }

  } catch (error) {
    console.error(`[Sync] Error syncing ${nodeName}:`, error);
  } finally {
    if (ssh) ssh.dispose();
  }
}