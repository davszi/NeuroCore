import { NextApiRequest, NextApiResponse } from 'next';
import { CLUSTER_NODES } from '@/lib/config';
import { runCommand } from '@/lib/ssh';
import { NodeConfig } from '@/types/cluster';
import { BenchmarkResult } from '@/components/benchmarks/performance/BenchmarkResultsView';

// Store benchmark results in memory (in production, use a database)
const benchmarkResults: Map<string, BenchmarkResult[]> = new Map();

/**
 * Run actual GPU benchmark on a specific GPU
 */
async function runGpuBenchmark(
  node: NodeConfig,
  gpuIndex: number,
  gpuId: string,
  gpuName: string
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  console.log(`🚀 [Benchmark] Starting benchmark on ${gpuId}...`);

  try {
    // Run GPU stress test for 30 seconds using nvidia-smi
    const benchmarkCmd = `
      CUDA_VISIBLE_DEVICES=${gpuIndex} timeout 30s python3 -c "
import torch
import time

# Create a large tensor and perform operations to stress the GPU
device = torch.device('cuda:0')
print('Starting GPU stress test...')

# Allocate memory and perform computations
for i in range(100):
    x = torch.randn(10000, 10000, device=device)
    y = torch.randn(10000, 10000, device=device)
    z = torch.matmul(x, y)
    torch.cuda.synchronize()
    time.sleep(0.1)

print('GPU stress test completed')
" 2>&1 || true
    `;

    // Start the benchmark in the background
    console.log(`📊 [Benchmark] Running stress test on ${gpuId}...`);
    runCommand(node, benchmarkCmd).catch(err => {
      console.log(`⚠️ [Benchmark] Stress test on ${gpuId} completed or timed out`);
    });

    // Wait a bit for the stress test to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Collect metrics during the stress test
    const metrics: any[] = [];
    const sampleCount = 10;
    const sampleInterval = 2000; // 2 seconds

    for (let i = 0; i < sampleCount; i++) {
      try {
        const metricsQuery = await runCommand(
          node,
          `nvidia-smi --query-gpu=index,utilization.gpu,memory.used,temperature.gpu,power.draw --format=csv,noheader,nounits | grep "^${gpuIndex},"`
        );

        const [idx, util, memUsed, temp, power] = metricsQuery.trim().split(',').map(s => s.trim());

        metrics.push({
          utilization: parseFloat(util) || 0,
          memoryUsed: parseFloat(memUsed) || 0,
          temperature: parseFloat(temp) || 0,
          powerDraw: parseFloat(power) || 0,
        });

        console.log(`📈 [Benchmark] ${gpuId} sample ${i + 1}/${sampleCount}: ${util}% util, ${temp}°C`);
      } catch (err) {
        console.error(`⚠️ [Benchmark] Failed to collect metrics for ${gpuId}:`, err);
      }

      if (i < sampleCount - 1) {
        await new Promise(resolve => setTimeout(resolve, sampleInterval));
      }
    }

    // Calculate averages
    const avgMetrics = {
      utilization_avg: metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length || 0,
      memory_used_avg: metrics.reduce((sum, m) => sum + m.memoryUsed, 0) / metrics.length || 0,
      temperature_avg: metrics.reduce((sum, m) => sum + m.temperature, 0) / metrics.length || 0,
      power_consumption_avg: metrics.reduce((sum, m) => sum + m.powerDraw, 0) / metrics.length || 0,
    };

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // Calculate benchmark score (higher is better)
    const benchmarkScore = Math.round(
      (avgMetrics.utilization_avg * 10) +
      (avgMetrics.power_consumption_avg * 2) +
      (100 - avgMetrics.temperature_avg) // Lower temp is better
    );

    console.log(`✅ [Benchmark] Completed ${gpuId}: ${avgMetrics.utilization_avg.toFixed(1)}% avg util, score: ${benchmarkScore}`);

    return {
      gpuId,
      nodeName: node.name,
      gpuName,
      status: 'completed' as const,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration,
      metrics: {
        ...avgMetrics,
        benchmark_score: benchmarkScore,
      },
    };
  } catch (error: any) {
    console.error(`🔴 [Benchmark] Error benchmarking ${gpuId}:`, error.message);

    return {
      gpuId,
      nodeName: node.name,
      gpuName,
      status: 'failed' as const,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration: Math.round((Date.now() - startTime) / 1000),
      metrics: {
        utilization_avg: 0,
        memory_used_avg: 0,
        temperature_avg: 0,
        power_consumption_avg: 0,
      },
      error: error.message,
    };
  }
}

/**
 * API endpoint to get the status of an ongoing benchmark.
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
    // Check if we have an active benchmark in global state
    const activeBenchmark = (global as any).activeBenchmark;

    if (activeBenchmark && activeBenchmark.benchmarkId === benchmarkId) {

      // Check for initialization status
      if (activeBenchmark.status === 'initializing') {
        return res.status(200).json({
          benchmarkId,
          isRunning: true,
          status: 'initializing',
          logs: activeBenchmark.logs || [],
          results: []
        });
      }

      if (activeBenchmark.status === 'failed') {
        return res.status(200).json({
          benchmarkId,
          isRunning: false,
          status: 'failed',
          error: activeBenchmark.error,
          logs: activeBenchmark.logs || [],
          results: []
        });
      }

      // Get or initialize results for this benchmark
      let results = benchmarkResults.get(benchmarkId);

      if (!results) {
        // If status is 'running' but no results initialized yet, start the background process
        if (!activeBenchmark.gpus || activeBenchmark.gpus.length === 0) {
          // Should happen if initialization detected no GPUs but didn't fail?
          return res.status(200).json({ benchmarkId, isRunning: false, results: [], error: 'No GPUs to benchmark' });
        }

        results = [];
        benchmarkResults.set(benchmarkId, results);

        // Start benchmarking GPUs in the background
        (async () => {
          console.log(`🚀 [Benchmark] Starting background benchmark process for ${benchmarkId}`);

          for (const gpu of activeBenchmark.gpus) {
            // Find the node config
            const nodeConfig = CLUSTER_NODES.find(n => n.name === gpu.nodeName);
            if (!nodeConfig) {
              console.error(`⚠️ [Benchmark] Node ${gpu.nodeName} not found`);
              continue;
            }

            // Run benchmark on this GPU
            const result = await runGpuBenchmark(
              nodeConfig as unknown as NodeConfig,
              gpu.gpuIndex,
              gpu.id,
              gpu.gpuName
            );

            // Store result
            const currentResults = benchmarkResults.get(benchmarkId) || [];
            currentResults.push(result);
            benchmarkResults.set(benchmarkId, currentResults);
          }

          // Mark benchmark as complete
          activeBenchmark.isRunning = false;
          activeBenchmark.status = 'completed';
          console.log(`✅ [Benchmark] Benchmark ${benchmarkId} completed`);

          // Save results to monthly file
          const finalResults = benchmarkResults.get(benchmarkId) || [];
          if (finalResults.length > 0) {
            try {
              const { saveBenchmarkResults } = await import('./monthly');
              saveBenchmarkResults(finalResults);
            } catch (error: any) {
              console.error('[Benchmark] Error saving monthly results:', error.message);
            }
          }
        })();
      }

      // Get current results
      const currentResults = benchmarkResults.get(benchmarkId) || [];
      const completedCount = currentResults.filter(r => r.status === 'completed' || r.status === 'failed').length;
      const isRunning = completedCount < activeBenchmark.gpus.length;

      // Create result list with pending GPUs
      const allResults: BenchmarkResult[] = activeBenchmark.gpus.map((gpu: any) => {
        const existingResult = currentResults.find(r => r.gpuId === gpu.id);

        if (existingResult) {
          return existingResult;
        }

        // GPU is pending or running
        return {
          gpuId: gpu.id,
          nodeName: gpu.nodeName,
          gpuName: gpu.gpuName,
          status: 'running' as const,
          startTime: new Date().toISOString(),
          metrics: {
            utilization_avg: 0,
            memory_used_avg: 0,
            temperature_avg: 0,
            power_consumption_avg: 0,
          },
        };
      });

      const currentGpu = isRunning && completedCount < activeBenchmark.gpus.length
        ? activeBenchmark.gpus[completedCount].id
        : null;

      return res.status(200).json({
        benchmarkId,
        isRunning,
        currentGpu,
        results: allResults,
        status: isRunning ? 'running' : 'completed',
        logs: activeBenchmark.logs || []
      });
    }

    // Benchmark not found or completed - return empty results
    return res.status(200).json({
      benchmarkId,
      isRunning: false,
      currentGpu: null,
      results: benchmarkResults.get(benchmarkId) || [],
      status: 'unknown'
    });
  } catch (error: any) {
    console.error('[Benchmark] Error fetching status:', error);
    return res.status(500).json({ error: `Failed to fetch benchmark status: ${error.message}` });
  }
}
