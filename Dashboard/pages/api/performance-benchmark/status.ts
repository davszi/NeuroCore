import { NextApiRequest, NextApiResponse } from 'next';
import { BenchmarkResult } from '@/components/benchmarks/BenchmarkResultsView';
import { CLUSTER_NODES, GPU_INVENTORY } from '@/lib/config';
import { fetchNodeHardware } from '@/lib/fetchers';
import { NodeConfig } from '@/types/cluster';

/**
 * API endpoint to get the status of an ongoing benchmark.
 * 
 * TODO: Connect to Pratham's implementation when ready
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { benchmarkId } = req.query;

  if (!benchmarkId || typeof benchmarkId !== 'string') {
    return res.status(400).json({ error: 'benchmarkId is required' });
  }

  try {
    // Try to fetch real GPU list and metrics from cluster
    const allGpus: Array<{ id: string; nodeName: string; gpuName: string; gpuIndex: number; realMetrics?: any }> = [];
    const gpuMetricsMap: Map<string, any> = new Map();
    
    // Fetch real GPU data from cluster (with timeout to avoid blocking)
    const fetchPromises = CLUSTER_NODES.filter(n => n.hasGpu).map(async (node) => {
      try {
        const result = await Promise.race([
          fetchNodeHardware(node as unknown as NodeConfig, GPU_INVENTORY),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as any;
        
        if (result && result.type === 'gpu') {
          const gpuNode = result.data;
          if (gpuNode.gpus && gpuNode.gpus.length > 0) {
            console.log(`[Benchmark] ✅ Successfully fetched real GPU data from ${node.name}: ${gpuNode.gpus.length} GPU(s)`);
            gpuNode.gpus.forEach((gpu: any) => {
              const gpuId = `${node.name}-gpu-${gpu.gpu_id}`;
              const realMetrics = {
                utilization_avg: gpu.utilization_percent || 0,
                memory_used_avg: gpu.memory_used_mib || 0,
                temperature_avg: gpu.temperature_celsius || 0,
                power_consumption_avg: gpu.power_draw_watts || 0,
              };
              console.log(`[Benchmark] 📊 Real metrics for ${gpuId}:`, realMetrics);
              allGpus.push({
                id: gpuId,
                nodeName: node.name,
                gpuName: gpu.gpu_name,
                gpuIndex: gpu.gpu_id,
                realMetrics,
              });
              gpuMetricsMap.set(gpuId, realMetrics);
            });
          }
        }
      } catch (err) {
        console.error(`[Benchmark] ❌ Failed to fetch real GPU data from ${node.name}:`, err);
        console.log(`[Benchmark] ⚠️ Using fallback (config-based) GPU list for ${node.name}`);
        // Fallback to config if SSH fails
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
      }
    });

    await Promise.allSettled(fetchPromises);

    if (allGpus.length === 0) {
      return res.status(500).json({ error: 'No GPUs found in cluster' });
    }

    // TODO: Fetch real status from Pratham's implementation
    // For now, return mock data with real GPU list
    
    // Simulate benchmark progress based on time
    const startTime = parseInt(benchmarkId.split('_')[1] || '0');
    
    // Validate startTime
    if (isNaN(startTime) || startTime === 0) {
      console.error(`[Benchmark Status] Invalid benchmarkId format: ${benchmarkId}`);
      return res.status(400).json({ error: 'Invalid benchmarkId format' });
    }
    
    const elapsed = Date.now() - startTime;
    const totalBenchmarkDuration = 10000; // Simulate 10 seconds total (for testing)
    const isRunning = elapsed < totalBenchmarkDuration;
    
    // Debug logging
    console.log(`[Benchmark Status] ID: ${benchmarkId}, StartTime: ${startTime}, Elapsed: ${elapsed}ms, IsRunning: ${isRunning}, TotalDuration: ${totalBenchmarkDuration}ms`);
    
    const gpuCompletionTime = totalBenchmarkDuration / allGpus.length;
    const completedCount = Math.floor(elapsed / gpuCompletionTime);
    
    const mockResults: BenchmarkResult[] = allGpus.map((gpu, idx) => {
      const gpuStartTime = startTime + idx * gpuCompletionTime;
      const gpuEndTime = startTime + (idx + 1) * gpuCompletionTime;
      
      // If benchmark is not running anymore, all GPUs should be completed
      const isGpuCompleted = !isRunning || elapsed >= gpuEndTime;
      const isGpuRunning = isRunning && !isGpuCompleted && elapsed >= gpuStartTime;
      
      if (isGpuCompleted) {
        // Completed - use real metrics if available, otherwise mock
        const realMetrics = gpuMetricsMap.get(gpu.id);
        const hasRealMetrics = realMetrics && (realMetrics.utilization_avg > 0 || realMetrics.power_consumption_avg > 0);
        
        if (hasRealMetrics) {
          console.log(`[Benchmark] ✅ Using REAL metrics for ${gpu.id}:`, realMetrics);
        } else {
          console.log(`[Benchmark] ⚠️ Using MOCK metrics for ${gpu.id} (real metrics not available)`);
        }
        
        return {
          gpuId: gpu.id,
          nodeName: gpu.nodeName,
          gpuName: gpu.gpuName,
          status: 'completed' as const,
          startTime: new Date(gpuStartTime).toISOString(),
          endTime: new Date(gpuEndTime).toISOString(),
          duration: Math.round(gpuCompletionTime / 1000),
          metrics: hasRealMetrics ? {
            utilization_avg: realMetrics.utilization_avg,
            memory_used_avg: realMetrics.memory_used_avg,
            temperature_avg: realMetrics.temperature_avg,
            power_consumption_avg: realMetrics.power_consumption_avg,
            benchmark_score: Math.round((realMetrics.utilization_avg * 10) + (realMetrics.power_consumption_avg * 2)), // Simple score calculation
          } : {
            // Fallback to mock if real metrics not available
            utilization_avg: 85 + Math.random() * 10,
            memory_used_avg: (60 + Math.random() * 20) * 1024, // MiB
            temperature_avg: 65 + Math.random() * 10,
            power_consumption_avg: 250 + Math.random() * 50,
            benchmark_score: 1000 + Math.random() * 200,
          },
        };
      } else if (isGpuRunning) {
        // Currently running
        return {
          gpuId: gpu.id,
          nodeName: gpu.nodeName,
          gpuName: gpu.gpuName,
          status: 'running' as const,
          startTime: new Date(gpuStartTime).toISOString(),
          metrics: {
            utilization_avg: 0,
            memory_used_avg: 0,
            temperature_avg: 0,
            power_consumption_avg: 0,
          },
        };
      } else {
        // Pending
        return {
          gpuId: gpu.id,
          nodeName: gpu.nodeName,
          gpuName: gpu.gpuName,
          status: 'running' as const,
          startTime: new Date(gpuStartTime).toISOString(),
          metrics: {
            utilization_avg: 0,
            memory_used_avg: 0,
            temperature_avg: 0,
            power_consumption_avg: 0,
          },
        };
      }
    });

    return res.status(200).json({
      benchmarkId,
      isRunning,
      currentGpu: isRunning && completedCount < allGpus.length ? allGpus[completedCount].id : null,
      results: mockResults,
    });
  } catch (error: any) {
    console.error('[Benchmark] Error fetching status:', error);
    return res.status(500).json({ error: `Failed to fetch benchmark status: ${error.message}` });
  }
}

