import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Fetch current cluster state to get actual GPU nodes
        const clusterResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/cluster-state`);

        if (!clusterResponse.ok) {
            throw new Error('Failed to fetch cluster state');
        }

        const clusterData = await clusterResponse.json();

        // Extract GPU nodes and their individual GPUs
        const gpuOptions: Array<{ name: string; nodeName: string; gpuId: number; gpuName: string }> = [];

        if (clusterData.gpu_nodes && Array.isArray(clusterData.gpu_nodes)) {
            clusterData.gpu_nodes.forEach((node: any) => {
                if (node.gpus && Array.isArray(node.gpus)) {
                    node.gpus.forEach((gpu: any) => {
                        gpuOptions.push({
                            name: `${node.node_name} (GPU ${gpu.gpu_id})`,
                            nodeName: node.node_name,
                            gpuId: gpu.gpu_id,
                            gpuName: gpu.gpu_name || 'Unknown GPU'
                        });
                    });
                }
            });
        }

        return res.status(200).json({
            success: true,
            gpus: gpuOptions,
            count: gpuOptions.length
        });

    } catch (error: any) {
        console.error(`🔴 [API] ERROR:`, error.message);
        return res.status(500).json({ error: 'Failed to fetch GPU nodes', details: error.message });
    }
}
