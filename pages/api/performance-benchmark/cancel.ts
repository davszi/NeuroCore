import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand, createConnection } from '@/lib/ssh';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';
import { NodeSSH } from 'node-ssh';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { benchmarkId } = req.body;

    console.log(`\n🛑 [Benchmark] CANCEL REQUEST for: ${benchmarkId}`);

    // 1. Update global state immediately
    const state = (global as any).activeBenchmark;
    if (state && state.benchmarkId === benchmarkId) {
        state.status = 'cancelled';
        state.isRunning = false;
        state.error = 'Manually terminated by user.';
        state.logs.push({
            timestamp: Date.now(),
            message: '🛑 [SYSTEM] Benchmark explicitly terminated by user request. Stopping all remote processes...'
        });
    }

    // Release pause flag immediately
    (global as any).isBenchmarkRunning = false;

    // 2. Asynchronously kill all benchmark processes on all nodes
    // We return the response immediately so the UI feels responsive
    res.status(200).json({ success: true, message: 'Cancellation protocol initiated.' });

    // Background cleanup
    performEmergencyCleanup(benchmarkId).catch(err => {
        console.error('[Benchmark] Emergency cleanup failed:', err);
    });
}

async function performEmergencyCleanup(benchmarkId: string) {
    const state = (global as any).activeBenchmark;
    const username = process.env.SSH_USER || 'pr35';

    const log = (message: string) => {
        console.log(message);
        if (state && state.benchmarkId === benchmarkId) {
            state.logs.push({ timestamp: Date.now(), message });
        }
    };

    for (const node of CLUSTER_NODES) {
        if (!node.hasGpu) continue;

        const targetNode = node as unknown as NodeConfig;
        let ssh: NodeSSH | null = null;

        try {
            ssh = await createConnection(targetNode);

            // Kill GPU burner processes (assuming they might be python or a specific burner binary)
            // For safety, we kill all user processes like we did in init, but focused on cleanup
            log(`[${targetNode.name}] 💀 Terminating benchmark processes...`);

            // Kill slurm jobs
            await runCommand(targetNode, `scancel -u ${username} 2>/dev/null || true`, 5000, ssh);

            // Final hammer: pkill all user processes
            log(`[${targetNode.name}] 💀 Issuing final force-kill for all user processes...`);
            await runCommand(targetNode, `pkill -u ${username} -9 2>/dev/null || true`, 10000, ssh);

            log(`[${targetNode.name}] ✅ Remote cleanup complete.`);
        } catch (e: any) {
            log(`[${targetNode.name}] ⚠️ Cleanup warning: ${e.message}`);
        } finally {
            if (ssh) ssh.dispose();
        }
    }

    log('✨ [Benchmark] Full cluster cleanup complete. System ready for next run.');
}
