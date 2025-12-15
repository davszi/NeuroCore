import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pid, nodeName } = req.body;

  if (!pid || !nodeName) {
    return res.status(400).json({ error: "Missing pid or nodeName" });
  }

  console.log(`\n🔴 [API] REQUEST TO CANCEL TRAINING (PID: ${pid}, Node: ${nodeName})`);

  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(400).json({ error: `Node '${nodeName}' not found.` });

    const checkCmd = `ps -p ${pid} > /dev/null && echo "exists" || echo "gone"`;
    const status = await runCommand(targetNode, checkCmd);

    console.log(`💀 [API] Terminating process tree for PID ${pid}...`);

    await runCommand(targetNode, `pkill -9 -P ${pid} || true`);
    
    if (status.trim() === 'exists') {
        await runCommand(targetNode, `kill -9 ${pid}`);
    }

    console.log(`✅ [API] Successfully killed process tree for ${pid}`);

    return res.status(200).json({ success: true, message: `Training stopped (PID ${pid})` });

  } catch (error: any) {
    console.error(`🔴 [API] ERROR:`, error.message);
    return res.status(500).json({ error: "Failed to cancel training", details: error.message });
  }
}