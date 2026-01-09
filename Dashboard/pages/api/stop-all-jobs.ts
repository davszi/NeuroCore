import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { password } = req.body;

    // Password validation
    if (password !== 'NeuroCore') {
        return res.status(401).json({ error: 'Invalid password' });
    }

    console.log('\n🛑 [API] REQUEST TO STOP ALL RUNNING JOBS');

    try {
        const results: Record<string, any> = {};

        // Iterate through all nodes and stop all jobs
        for (const node of CLUSTER_NODES) {
            const targetNode = node as unknown as NodeConfig;
            console.log(`🔍 [API] Checking node: ${targetNode.name}`);

            try {
                // Get all running Python processes (training jobs)
                const listCmd = `ps aux | grep -E '(python|train)' | grep -v grep | awk '{print $2}'`;
                const pids = await runCommand(targetNode, listCmd);

                const pidList = pids.trim().split('\n').filter(p => p && !isNaN(Number(p)));

                if (pidList.length > 0) {
                    console.log(`💀 [API] Killing ${pidList.length} processes on ${targetNode.name}...`);

                    // Kill all found processes
                    for (const pid of pidList) {
                        try {
                            await runCommand(targetNode, `pkill -9 -P ${pid} || true`);
                            await runCommand(targetNode, `kill -9 ${pid} || true`);
                        } catch (e) {
                            console.log(`⚠️ [API] Failed to kill PID ${pid}, might already be dead`);
                        }
                    }

                    results[targetNode.name] = { killed: pidList.length, pids: pidList };
                } else {
                    results[targetNode.name] = { killed: 0, pids: [] };
                }
            } catch (nodeError: any) {
                console.error(`🔴 [API] Error on node ${targetNode.name}:`, nodeError.message);
                results[targetNode.name] = { error: nodeError.message };
            }
        }

        console.log(`✅ [API] All jobs stopped successfully`);
        return res.status(200).json({ success: true, results });

    } catch (error: any) {
        console.error(`🔴 [API] ERROR:`, error.message);
        return res.status(500).json({ error: 'Failed to stop all jobs', details: error.message });
    }
}
