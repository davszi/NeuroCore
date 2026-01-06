import { NextApiRequest, NextApiResponse } from 'next';
import { CLUSTER_NODES, GPU_INVENTORY } from '@/lib/config';

/**
 * API endpoint to start a performance benchmark on all GPUs.
 * This will:
 * 1. Verify password
 * 2. Kill all ongoing jobs
 * 3. Run benchmarks sequentially on every GPU
 * 
 * TODO: Connect to Pratham's implementation when ready
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Mock password verification (for testing)
  // TODO: Replace with Pratham's password verification
  const MOCK_PASSWORD = 'test123'; // Change this for testing
  if (password !== MOCK_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    // Get GPU list from config (fast, no SSH blocking)
    // TODO: When Pratham implements, use real GPU detection here
    const allGpus: Array<{ id: string; nodeName: string; gpuName: string; gpuIndex: number }> = [];
    
    CLUSTER_NODES.filter(n => n.hasGpu).forEach(node => {
      const gpuCount = GPU_INVENTORY.nodes[node.name]?.cores_total 
        ? Math.floor(GPU_INVENTORY.nodes[node.name].cores_total / 16) 
        : 2;
      
      for (let i = 0; i < gpuCount; i++) {
        allGpus.push({
          id: `${node.name}-gpu-${i}`,
          nodeName: node.name,
          gpuName: GPU_INVENTORY.nodes[node.name]?.gpu_name || GPU_INVENTORY.defaults.gpu_name,
          gpuIndex: i,
        });
      }
    });

    if (allGpus.length === 0) {
      return res.status(500).json({ error: 'No GPUs found in cluster' });
    }

    // TODO: Kill all jobs (Pratham's part)
    // TODO: Start benchmarks on all GPUs (Pratham's part)

    // For now, return a response with real GPU list
    const benchmarkId = `benchmark_${Date.now()}`;
    return res.status(200).json({
      success: true,
      message: `Benchmark initialized for ${allGpus.length} GPU(s) (MOCK MODE - waiting for Pratham's implementation)`,
      benchmarkId,
      gpuCount: allGpus.length,
      gpus: allGpus.map(g => ({ id: g.id, nodeName: g.nodeName, gpuName: g.gpuName })),
    });
  } catch (error: any) {
    console.error('[Benchmark] Error starting benchmark:', error);
    return res.status(500).json({ error: `Failed to initialize benchmark: ${error.message}` });
  }
}

