import { NextApiRequest, NextApiResponse } from 'next';
import { MonthlyBenchmarkData } from '@/components/benchmarks/MonthlyComparisonChart';
import { CLUSTER_NODES, GPU_INVENTORY } from '@/lib/config';

// Cache GPU list to avoid repeated SSH calls
let cachedGpuList: Array<{ id: string; name: string }> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getGpuListFromCache(): Array<{ id: string; name: string }> {
  const now = Date.now();
  
  // Return cached list if still valid
  if (cachedGpuList && (now - cacheTimestamp < CACHE_DURATION)) {
    return cachedGpuList;
  }

  // Build GPU list from config (faster than SSH)
  const allGpus: Array<{ id: string; name: string }> = [];
  
  CLUSTER_NODES.filter(n => n.hasGpu).forEach(node => {
    // Try to get GPU count from inventory, fallback to 2
    const gpuCount = GPU_INVENTORY.nodes[node.name]?.cores_total 
      ? Math.floor(GPU_INVENTORY.nodes[node.name].cores_total / 16) 
      : 2;
    
    for (let i = 0; i < gpuCount; i++) {
      allGpus.push({
        id: `${node.name}-gpu-${i}`,
        name: GPU_INVENTORY.nodes[node.name]?.gpu_name || GPU_INVENTORY.defaults.gpu_name,
      });
    }
  });

  // Update cache
  cachedGpuList = allGpus;
  cacheTimestamp = now;
  
  return allGpus;
}

/**
 * API endpoint to fetch monthly benchmark comparison data.
 * 
 * TODO: Connect to Pratham's implementation when ready
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get GPU list from cache (fast, no SSH)
    const allGpus = getGpuListFromCache();

    // Generate last 6 months of data
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }
    
    // TODO: Fetch real monthly data from Pratham's implementation
    // For now, return mock data with real GPU list
    const mockData: MonthlyBenchmarkData[] = [];
    
    allGpus.forEach(gpu => {
      months.forEach((month, monthIdx) => {
        // Simulate slight degradation over time
        const degradationFactor = 1 - (monthIdx * 0.02); // 2% degradation per month
        
        mockData.push({
          month,
          gpuId: gpu.id,
          metrics: {
            utilization_avg: (85 + Math.random() * 10) * degradationFactor,
            memory_used_avg: (60 + Math.random() * 20) * degradationFactor * 1024,
            temperature_avg: (65 + Math.random() * 10) + (monthIdx * 0.5), // Slight temp increase
            power_consumption_avg: (250 + Math.random() * 50) * degradationFactor,
            benchmark_score: (1000 + Math.random() * 200) * degradationFactor,
          },
        });
      });
    });

    return res.status(200).json({
      data: mockData,
    });
  } catch (error: any) {
    console.error('[Benchmark] Error fetching monthly data:', error);
    return res.status(500).json({ error: `Failed to fetch monthly data: ${error.message}` });
  }
}

