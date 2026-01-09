import { NextApiRequest, NextApiResponse } from 'next';
import { CLUSTER_NODES, GPU_INVENTORY } from '@/lib/config';
import { runCommand } from '@/lib/ssh';
import { NodeConfig } from '@/types/cluster';

/**
 * API endpoint to start a performance benchmark on all GPUs.
 * This will:
 * 1. Verify password
 * 2. Stops all ongoing jobs on all nodes
 * 3. Run benchmarks sequentially on every GPU
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Password verification
  const BENCHMARK_PASSWORD = 'NeuroCore';
  if (password !== BENCHMARK_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  console.log('\n🚀 [Benchmark] Starting performance benchmark...');

  // Step 1: Stop ALL running jobs on all nodes (SLURM + processes)
  console.log('🛑 [Benchmark] Stopping ALL running jobs...');
  const stoppedJobs: Record<string, { slurm: number; processes: number; verified: boolean }> = {};

  try {
    const username = process.env.SSH_USER || 'pr35';

    for (const node of CLUSTER_NODES) {
      const targetNode = node as unknown as NodeConfig;
      console.log(`\n🔍 [Benchmark] Processing node: ${targetNode.name}`);

      const nodeStats = { slurm: 0, processes: 0, verified: false };

      try {
        // STEP 1A: Cancel ALL SLURM jobs for this user
        console.log(`📋 [Benchmark] Canceling SLURM jobs on ${targetNode.name}...`);
        try {
          // Get list of running SLURM jobs
          const slurmListCmd = `squeue -u ${username} -h -o "%A" 2>/dev/null || true`;
          const jobIds = await runCommand(targetNode, slurmListCmd, 10000);

          if (jobIds && jobIds.trim()) {
            const jobIdList = jobIds.trim().split('\n').filter(id => id && !isNaN(Number(id)));

            if (jobIdList.length > 0) {
              console.log(`💀 [Benchmark] Found ${jobIdList.length} SLURM job(s): ${jobIdList.join(', ')}`);

              // Cancel all jobs at once
              const scancelCmd = `scancel -u ${username} 2>/dev/null || true`;
              await runCommand(targetNode, scancelCmd, 10000);

              nodeStats.slurm = jobIdList.length;
              console.log(`✅ [Benchmark] Canceled ${jobIdList.length} SLURM job(s) on ${targetNode.name}`);

              // Wait for jobs to actually cancel
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              console.log(`ℹ️  [Benchmark] No SLURM jobs running on ${targetNode.name}`);
            }
          } else {
            console.log(`ℹ️  [Benchmark] No SLURM jobs running on ${targetNode.name}`);
          }
        } catch (slurmError: any) {
          console.log(`⚠️  [Benchmark] SLURM not available on ${targetNode.name} (this is OK if not using SLURM)`);
        }

        // STEP 1B: Kill ALL user processes
        console.log(`🔪 [Benchmark] Killing all user processes on ${targetNode.name}...`);
        try {
          // Get ALL processes owned by the user (excluding SSH session)
          const listCmd = `ps -u ${username} -o pid=,comm= | grep -v "sshd\\|bash\\|ps\\|grep" | awk '{print $1}'`;
          const pids = await runCommand(targetNode, listCmd, 10000);

          if (pids && pids.trim()) {
            const pidList = pids.trim().split('\n').filter(p => p && !isNaN(Number(p)));

            if (pidList.length > 0) {
              console.log(`💀 [Benchmark] Found ${pidList.length} process(es) on ${targetNode.name}`);
              console.log(`💀 [Benchmark] PIDs: ${pidList.join(', ')}`);

              // Kill all processes
              let killedCount = 0;
              for (const pid of pidList) {
                try {
                  // Kill child processes first
                  await runCommand(targetNode, `pkill -9 -P ${pid} 2>/dev/null || true`, 3000);
                  // Kill parent process
                  await runCommand(targetNode, `kill -9 ${pid} 2>/dev/null || true`, 3000);
                  killedCount++;
                } catch (e: any) {
                  console.log(`⚠️  [Benchmark] Could not kill PID ${pid}: ${e.message}`);
                }
              }

              nodeStats.processes = killedCount;
              console.log(`✅ [Benchmark] Killed ${killedCount}/${pidList.length} process(es) on ${targetNode.name}`);
            } else {
              console.log(`ℹ️  [Benchmark] No user processes to kill on ${targetNode.name}`);
            }
          } else {
            console.log(`ℹ️  [Benchmark] No user processes to kill on ${targetNode.name}`);
          }
        } catch (procError: any) {
          console.error(`🔴 [Benchmark] Error killing processes on ${targetNode.name}:`, procError.message);
        }

        // STEP 1C: Verify everything is stopped
        console.log(`🔍 [Benchmark] Verifying all jobs stopped on ${targetNode.name}...`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

        try {
          // Check SLURM jobs again
          const verifySlurm = await runCommand(targetNode, `squeue -u ${username} -h 2>/dev/null | wc -l`, 5000);
          const slurmCount = parseInt(verifySlurm.trim()) || 0;

          // Check processes again
          const verifyProcs = await runCommand(targetNode, `ps -u ${username} -o pid= | grep -v "sshd\\|bash\\|ps\\|grep" | wc -l`, 5000);
          const procCount = parseInt(verifyProcs.trim()) || 0;

          if (slurmCount === 0 && procCount === 0) {
            nodeStats.verified = true;
            console.log(`✅ [Benchmark] VERIFIED: All jobs stopped on ${targetNode.name}`);
          } else {
            console.warn(`⚠️  [Benchmark] WARNING: Still found ${slurmCount} SLURM job(s) and ${procCount} process(es) on ${targetNode.name}`);
          }
        } catch (verifyError: any) {
          console.warn(`⚠️  [Benchmark] Could not verify job stopping on ${targetNode.name}`);
        }

        stoppedJobs[targetNode.name] = nodeStats;

      } catch (nodeError: any) {
        console.error(`🔴 [Benchmark] Error on node ${targetNode.name}:`, nodeError.message);
        stoppedJobs[targetNode.name] = { slurm: -1, processes: -1, verified: false };
      }
    }

    // Summary
    const totalSlurm = Object.values(stoppedJobs).reduce((sum, s) => sum + Math.max(0, s.slurm), 0);
    const totalProcs = Object.values(stoppedJobs).reduce((sum, s) => sum + Math.max(0, s.processes), 0);
    const allVerified = Object.values(stoppedJobs).every(s => s.verified);

    console.log(`\n✅ [Benchmark] Job stopping complete!`);
    console.log(`📊 [Benchmark] Total SLURM jobs canceled: ${totalSlurm}`);
    console.log(`📊 [Benchmark] Total processes killed: ${totalProcs}`);
    console.log(`📊 [Benchmark] All nodes verified clean: ${allVerified ? 'YES ✅' : 'NO ⚠️'}`);
    console.log(`📊 [Benchmark] Per-node details:`, JSON.stringify(stoppedJobs, null, 2));

    if (!allVerified) {
      console.warn(`⚠️  [Benchmark] WARNING: Some nodes still have running jobs. Proceeding anyway...`);
    }

  } catch (error: any) {
    console.error('🔴 [Benchmark] Error stopping jobs:', error.message);
    return res.status(500).json({ error: 'Failed to stop running jobs', details: error.message });
  }


  // Step 2: Get real GPU list from all nodes
  console.log('📊 [Benchmark] Collecting GPU information from all nodes...');
  try {
    const allGpus: Array<{ id: string; nodeName: string; gpuName: string; gpuIndex: number }> = [];
    const gpuErrors: string[] = [];

    for (const node of CLUSTER_NODES.filter(n => n.hasGpu)) {
      const targetNode = node as unknown as NodeConfig;
      console.log(`🔍 [Benchmark] Querying GPUs on ${targetNode.name}...`);

      try {
        // Get GPU information using nvidia-smi
        const gpuQuery = await runCommand(
          targetNode,
          `nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits`,
          10000 // 10 second timeout
        );

        if (!gpuQuery || gpuQuery.trim() === '') {
          const error = `No output from nvidia-smi on ${targetNode.name}`;
          console.error(`⚠️ [Benchmark] ${error}`);
          gpuErrors.push(error);
          continue;
        }

        const gpuLines = gpuQuery.trim().split('\n').filter(line => line.trim());

        if (gpuLines.length === 0) {
          const error = `No GPUs detected on ${targetNode.name}`;
          console.error(`⚠️ [Benchmark] ${error}`);
          gpuErrors.push(error);
          continue;
        }

        for (const line of gpuLines) {
          const [indexStr, gpuName] = line.split(',').map(s => s.trim());
          const gpuIndex = parseInt(indexStr);

          if (!isNaN(gpuIndex)) {
            const gpuId = `${targetNode.name}-gpu-${gpuIndex}`;
            allGpus.push({
              id: gpuId,
              nodeName: targetNode.name,
              gpuName: gpuName || 'Unknown GPU',
              gpuIndex,
            });
            console.log(`✅ [Benchmark] Found GPU: ${gpuId} (${gpuName})`);
          }
        }
      } catch (nodeError: any) {
        const error = `${targetNode.name}: ${nodeError.message}`;
        console.error(`🔴 [Benchmark] Failed to query GPUs on ${targetNode.name}:`, nodeError.message);
        gpuErrors.push(error);
        // Do NOT use fallback - we want real GPU data only
        // The benchmark will fail if we can't detect real GPUs
      }
    }

    if (allGpus.length === 0) {
      const errorMsg = gpuErrors.length > 0
        ? `No GPUs detected. Errors:\n${gpuErrors.map(e => `  - ${e}`).join('\n')}`
        : 'No GPUs found in cluster';

      console.error(`🔴 [Benchmark] ${errorMsg}`);

      return res.status(500).json({
        error: 'No GPUs detected',
        details: errorMsg,
        suggestions: [
          'Ensure nvidia-smi is installed on GPU nodes',
          'Verify SSH connectivity to all nodes',
          'Check that nodes actually have GPUs installed',
          'Review server logs for detailed error messages'
        ]
      });
    }

    console.log(`✅ [Benchmark] Found ${allGpus.length} GPU(s) total across ${new Set(allGpus.map(g => g.nodeName)).size} node(s)`);

    // Step 3: Create benchmark ID and return immediately
    // The actual benchmarking will be tracked via the status endpoint
    const benchmarkId = `benchmark_${Date.now()}`;

    // Store benchmark metadata in global state (will be picked up by status endpoint)
    (global as any).activeBenchmark = {
      benchmarkId,
      gpus: allGpus,
      startTime: Date.now(),
      isRunning: true,
    };

    console.log(`🚀 [Benchmark] Benchmark ${benchmarkId} initialized with ${allGpus.length} GPU(s)`);

    return res.status(200).json({
      success: true,
      message: `Benchmark started on ${allGpus.length} GPU(s)`,
      benchmarkId,
      gpuCount: allGpus.length,
      gpus: allGpus.map(g => ({ id: g.id, nodeName: g.nodeName, gpuName: g.gpuName })),
    });
  } catch (error: any) {
    console.error('[Benchmark] Error starting benchmark:', error);
    return res.status(500).json({ error: `Failed to initialize benchmark: ${error.message}` });
  }
}

