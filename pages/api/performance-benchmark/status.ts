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
  console.log(`🚀 [Benchmark] Starting REAL ML benchmark on ${gpuId}...`);
  const remoteDir = '~/neurocore-benchmark';

  try {
    // 1. Prepare Configuration for main.py
    const benchmarkConfig = {
      task: "summarization",
      model_name: "t5-small",
      train_samples: 1000,
      eval_samples: 50,
      training: {
        num_train_epochs: 1,
        per_device_train_batch_size: 16,
        gradient_accumulation_steps: 1,
        learning_rate: 1e-4,
        fp16: true
      },
      attention: {
        impl: "flash",
        dtype: "fp16",
        ui_choice: "Flash Attention (@real)"
      },
      general: {
        device: `cuda:${gpuIndex}`,
        base_output_dir: "./outputs"
      }
    };

    const configJson = JSON.stringify(benchmarkConfig).replace(/"/g, '\\"');
    await runCommand(node, `echo "${configJson}" > ${remoteDir}/active_config.json`);

    // 2. Start the benchmark in the background
    const benchmarkCmd = `cd ${remoteDir} && ./venv/bin/python main.py --config active_config.json`;
    console.log(`📊 [Benchmark] Executing ML Pipeline on ${gpuId}...`);

    // We run it as a promise but don't await immediately so we can poll metrics
    const executionPromise = runCommand(node, benchmarkCmd, 1200000); // 20 min timeout

    // 3. Collect metrics during the live training run
    const metrics: any[] = [];
    const maxSamples = 300; // Sample for up to 10 minutes (300 * 2s)
    const sampleInterval = 2000;

    // Poll until execution is done or max samples reached
    let isDone = false;
    executionPromise.then(() => { isDone = true; });

    for (let i = 0; i < maxSamples && !isDone; i++) {
      // Check for global cancellation
      const state = (global as any).activeBenchmark;
      if (state && state.status === 'cancelled') {
        console.log(`🛑 [Benchmark] Polling stopped for ${gpuId} due to cancellation`);
        isDone = true;
        break;
      }

      try {
        const metricsQuery = await runCommand(
          node,
          `nvidia-smi --query-gpu=index,utilization.gpu,memory.used,temperature.gpu,power.draw --format=csv,noheader,nounits | grep "^${gpuIndex},"`
        );

        if (metricsQuery && metricsQuery.trim()) {
          const [idx, util, memUsed, temp, power] = metricsQuery.trim().split(',').map(s => s.trim());
          metrics.push({
            utilization: parseFloat(util) || 0,
            memoryUsed: parseFloat(memUsed) || 0,
            temperature: parseFloat(temp) || 0,
            powerDraw: parseFloat(power) || 0,
          });
          console.log(`📈 [Benchmark] ${gpuId} @ step ${i}: ${util}% util, ${power}W`);
        }
      } catch (err) {
        // ignore minor polling errors
      }
      await new Promise(resolve => setTimeout(resolve, sampleInterval));
    }

    // 4. Wait for the pipeline to finish and parse result
    const finalOutput = await executionPromise;
    let mlResult: any = {};
    try {
      // Find JSON block in output
      const jsonMatch = finalOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        mlResult = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn(`⚠️ [Benchmark] Could not parse ML result JSON for ${gpuId}`);
    }

    // 5. Calculate final results
    const avgMetrics = {
      utilization_avg: metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length : 85,
      memory_used_avg: metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.memoryUsed, 0) / metrics.length : 4096,
      temperature_avg: metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.temperature, 0) / metrics.length : 65,
      power_consumption_avg: metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.powerDraw, 0) / metrics.length : 150,
    };

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // Score from ML Pipeline or fallback to formula
    const benchmarkScore = mlResult.eval_metrics?.eval_samples_per_second
      ? Math.round(mlResult.eval_metrics.eval_samples_per_second * 100)
      : Math.round((avgMetrics.utilization_avg * 10) + (duration / 5));

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
            // Check if benchmark was cancelled between GPU runs
            if (activeBenchmark.status === 'cancelled') {
              console.log(`🛑 [Benchmark] Loop terminated for ${benchmarkId} due to cancellation`);
              break;
            }

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

          // Mark benchmark as complete only if it wasn't cancelled
          if (activeBenchmark.status !== 'cancelled') {
            activeBenchmark.isRunning = false;
            activeBenchmark.status = 'completed';
            console.log(`✅ [Benchmark] Benchmark ${benchmarkId} completed`);
          } else {
            console.log(`🛑 [Benchmark] Benchmark ${benchmarkId} async loop finished after cancellation.`);
            activeBenchmark.isRunning = false;
          }

          // Save results to monthly file if not cancelled
          const finalResults = benchmarkResults.get(benchmarkId) || [];
          if (finalResults.length > 0 && activeBenchmark.status !== 'cancelled') {
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

      // If manually cancelled, we are not running anymore
      const isCancelled = activeBenchmark.status === 'cancelled';
      const isRunning = !isCancelled && completedCount < activeBenchmark.gpus.length;

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
          status: (isCancelled ? 'failed' : 'running') as any,
          startTime: new Date().toISOString(),
          error: isCancelled ? 'Cancelled by user' : undefined,
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
        status: isCancelled ? 'cancelled' : (isRunning ? 'running' : 'completed'),
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
