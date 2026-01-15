import { NextApiRequest, NextApiResponse } from 'next';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { mode, nodeName } = req.body;

    console.log(`\n🔵 [API] SIMULATED COMPARISON BENCHMARK: ${nodeName} (${mode})`);

    try {
        const targetNode = CLUSTER_NODES.find(n => n.name === nodeName);
        if (!targetNode) return res.status(400).json({ error: `Node '${nodeName}' not found.` });

        // Simulate training with realistic timing
        const startTime = Date.now();

        // Simulate different durations based on mode
        const baseDuration = 15; // Base duration in seconds
        const variability = Math.random() * 5; // Random variability

        let simulatedDuration;
        if (mode === 'with_jobs') {
            // With jobs: slower (20-25 seconds)
            simulatedDuration = baseDuration + 5 + variability;
        } else {
            // Without jobs: faster (15-20 seconds)
            simulatedDuration = baseDuration + variability;
        }

        // Simulate the work
        await new Promise(resolve => setTimeout(resolve, simulatedDuration * 1000));

        const endTime = Date.now();
        const actualDuration = (endTime - startTime) / 1000;

        console.log(`✅ [API] Simulated training completed in ${actualDuration.toFixed(2)}s`);

        return res.status(200).json({
            success: true,
            runId: `comparison_${mode}_${Date.now()}`,
            node: targetNode.name,
            mode,
            duration: actualDuration,
            startTime,
            endTime,
            simulated: true
        });

    } catch (error: any) {
        console.error(`🔴 [API] ERROR:`, error.message);
        return res.status(500).json({ error: 'Failed to run comparison', details: error.message });
    }
}
