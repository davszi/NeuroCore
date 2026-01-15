import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';
import { getSettings } from '@/lib/settings-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodeName } = req.query;
  
  // Default to the first GPU node if none specified (usually where training happens)
  const targetNodeName = (nodeName as string) || CLUSTER_NODES.find(n => n.hasGpu)?.name;
  if (!targetNodeName) return res.status(400).json({ error: "No GPU node found" });

  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === targetNodeName) as unknown as NodeConfig;
    const { remotePath } = getSettings();
    const APP_ROOT = remotePath;
    const OUTPUTS_DIR = `${APP_ROOT}/outputs`;

    // 1. List all directories starting with "run_", sorted by time (newest first)
    // -t: sort by time, -1: one per line
    const cmd = `ls -t1 ${OUTPUTS_DIR} | grep "^run_"`;
    
    const result = await runCommand(targetNode, cmd);
    
    // 2. Parse the output into a clean list
    const runs = result.trim().split('\n').filter(Boolean).map(id => {
        const ts = parseInt(id.replace('run_', ''));
        const date = isNaN(ts) ? 'Unknown' : new Date(ts * 1000).toLocaleString();
        
        return {
            id: id,
            display: `Run ${id.replace('run_', '')} (${date})`
        };
    });

    return res.status(200).json({ runs });

  } catch (error: any) {
    console.error("[API] List Runs Failed:", error.message);
    // Return empty list instead of error so UI doesn't crash
    return res.status(200).json({ runs: [] });
  }
}