import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { runCommand } from '@/lib/ssh';
import { Job, NodeConfig } from '@/types/cluster';

/**
 * Polls a single node for both GPU and CPU jobs.
 */
async function getJobsFromNode(node: NodeConfig): Promise<Job[]> {
  const records: Job[] = [];

  // --- 1. GPU Jobs Command ---
  // Query NVIDIA SMI for active compute processes
  const JOB_CMD_GPU = `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits`;
  const gpuOutput = await runCommand(node, JOB_CMD_GPU);

  if (gpuOutput) {
    gpuOutput.trim().split('\n').forEach((line) => {
      const parts = line.split(', ');
      if (parts.length < 3) return;

      const pid = parseInt(parts[0]);
      const process_name = parts[1];
      const memory_usage_mib = parseFloat(parts[2]);

      // Logic to extract user from path (e.g., /scratch/username/...)
      let user = 'unknown';
      const pathParts = process_name.split('/');
      // If path contains 'scratch', user is usually the next segment
      const scratchIndex = pathParts.indexOf('scratch');
      if (scratchIndex !== -1 && pathParts[scratchIndex + 1]) {
        user = pathParts[scratchIndex + 1];
      }

      records.push({
        node: node.name,
        user,
        pid,
        process_name,
        gpu_memory_usage_mib: memory_usage_mib,
      });
    });
  }

  // --- 2. CPU Jobs Command ---
  // Get top 20 CPU-consuming processes, excluding root
  const JOB_CMD_CPU = `ps -eo pid,user,%cpu,comm --sort=-%cpu | head -n 20`;
  const cpuOutput = await runCommand(node, JOB_CMD_CPU);

  if (cpuOutput) {
    // Skip the first line (header)
    const lines = cpuOutput.trim().split('\n').slice(1);
    
    lines.forEach((line) => {
      // Split by whitespace, limit to 4 parts
      const match = line.trim().split(/\s+/);
      if (match.length < 4) return;

      const pid = parseInt(match[0]);
      const user = match[1];
      const cpu_percent = parseFloat(match[2]);
      const process_name = match[3];

      // Filter: Ignore root and low CPU usage
      if (user === 'root') return;
      if (cpu_percent < 5.0) return; 

      records.push({
        node: node.name,
        user,
        pid,
        process_name: `${process_name} (CPU)`,
        gpu_memory_usage_mib: 0, // 0 indicates a CPU job
        cpu_percent: cpu_percent
      });
    });
  }

  return records;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let nodesConfig;

  try {
    // Load config safely
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    
    if (!fs.existsSync(nodesPath)) {
      throw new Error(`Config file not found at: ${nodesPath}`);
    }

    const fileContent = fs.readFileSync(nodesPath, 'utf8');
    nodesConfig = yaml.load(fileContent) as { nodes: NodeConfig[] };

  } catch (e) {
    console.error(`[jobs-api] Failed to load config.`);
    return res.status(500).json({ error: 'Configuration Error', details: (e as Error).message });
  }

  // Run all nodes in parallel
  // This is much faster than awaiting them one by one
  const pollPromises = nodesConfig.nodes.map(node => getJobsFromNode(node));
  const results = await Promise.all(pollPromises);

  // Flatten the array of arrays into a single list of jobs
  const allJobs: Job[] = results.flat();

  // Sort by GPU memory usage (descending) as a default view
  allJobs.sort((a, b) => b.gpu_memory_usage_mib - a.gpu_memory_usage_mib);

  res.status(200).json(allJobs);
}