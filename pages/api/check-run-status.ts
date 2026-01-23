import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';
import { syncNodeBenchmarks } from '@/lib/ml-sync'; // <--- 1. Import Sync Logic

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Accept runId
  const { pid, nodeName, runId } = req.body;

  if (!pid || !nodeName) {
    return res.status(400).json({ error: "Missing pid or nodeName" });
  }

  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(404).json({ isRunning: false });

    // 1. Try to read the status file if runId is provided
    if (runId) {
      const APP_ROOT = getInstallPath(targetNode.name);
      const statusFile = `${APP_ROOT}/logs/${runId}_status.json`;

      try {
        const fileContent = await runCommand(targetNode, `cat ${statusFile}`);
        const statusData = JSON.parse(fileContent.trim());

        // --- 2. NEW: TRIGGER SYNC ON SUCCESS ---
        if (statusData.status === 'success') {
            console.log(`[API] Run ${runId} success detected. Triggering instant sync...`);
            syncNodeBenchmarks(nodeName).catch(e => console.error("[API] Instant sync trigger failed:", e));
            return res.status(200).json({ status: 'success', isRunning: false });
        }
        
        if (statusData.status === 'failed') {
            return res.status(200).json({ status: 'failed', isRunning: false });
        }
        
      } catch (e) {
        // File doesn't exist yet (startup race condition) or other error.
      }
    }

    // 2. Fallback: Check PID (for legacy runs or if file check failed)
    const output = await runCommand(targetNode, `ps -p ${pid} -o pid=`);
    const isRunning = output && output.trim().length > 0;

    if (isRunning) {
       return res.status(200).json({ status: 'running', isRunning: true });
    } else {
       // If PID is gone and file didn't say success, it likely crashed
       return res.status(200).json({ status: 'crashed', isRunning: false });
    }

  } catch (error: any) {
    console.error(`[API] Status Check Failed:`, error.message);
    return res.status(200).json({ isRunning: false }); 
  }
}