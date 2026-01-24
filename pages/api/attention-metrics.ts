import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodeName, runId } = req.query;

  if (!nodeName || !runId) return res.status(400).json({ error: 'Missing parameters' });
  const runIdStr = runId as string;

  // --- STRATEGY 1: CHECK LOCAL CACHE (Fastest) ---
  // We only cache COMPLETED runs.
  const localDir = path.join(process.cwd(), 'data/ml-history', nodeName as string, runIdStr);
  
  if (runIdStr !== 'latest' && fs.existsSync(path.join(localDir, 'run_metrics.jsonl'))) {
      try {
          const config = JSON.parse(fs.readFileSync(path.join(localDir, 'config.json'), 'utf8'));
          const result = JSON.parse(fs.readFileSync(path.join(localDir, 'run_metrics.jsonl'), 'utf8'));
          
          const metricsRaw = fs.readFileSync(path.join(localDir, 'step_metrics.jsonl'), 'utf8');
          const data = metricsRaw.trim().split('\n').map(l => JSON.parse(l));

          // Indicate source for debugging
          res.setHeader('X-Data-Source', 'Local-Cache');
          return res.status(200).json({ data, config, result });
      } catch (e) {
          console.warn(`[API] Local cache read failed for ${runId}, falling back to SSH.`);
      }
  }

  // --- STRATEGY 2: FETCH VIA SSH (Active Runs or Not Synced Yet) ---
  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(404).json({ error: 'Node not found' });

    const remotePath = getInstallPath(targetNode.name);
    const OUTPUTS_DIR = `${remotePath}/outputs`;
    
    let runDir = "";

    if (runIdStr === 'latest') {
        const findCmd = `ls -td ${OUTPUTS_DIR}/run_* | head -1`;
        const newestRun = await runCommand(targetNode, findCmd);
        if (!newestRun || !newestRun.trim()) {
            return res.status(200).json({ data: [], config: null, result: null }); 
        }
        runDir = newestRun.trim();
    } else {
        runDir = `${OUTPUTS_DIR}/${runIdStr}`;
    }

    // Fetch Config
    let config = null;
    try {
        const c = await runCommand(targetNode, `cat "${runDir}/config.json"`);
        config = JSON.parse(c);
    } catch {}

    // Fetch Result (Might be null if still running)
    let result = null;
    try {
        const r = await runCommand(targetNode, `tail -n 1 "${runDir}/run_metrics.jsonl"`);
        result = JSON.parse(r);
    } catch {}

    // Fetch Metrics
    let data: any[] = [];
    try {
        const m = await runCommand(targetNode, `cat "${runDir}/step_metrics.jsonl"`);
        data = m.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    } catch {}

    res.setHeader('X-Data-Source', 'Remote-SSH');
    return res.status(200).json({ data, config, result });

  } catch (error: any) {
    console.error(`[API] Metrics Error: ${error.message}`);
    return res.status(500).json({ error: "Failed to fetch metrics" });
  }
}