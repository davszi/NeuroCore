import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// --- TYPE DEFINITIONS ---
// Adding these interfaces fixes the 'any' type error

interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_util_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_watts: number;
  power_limit_watts: number;
}

interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;
  gpus: Gpu[];
}

// --- HELPER FUNCTION ---

function readJsonlFile(filePath: string): any[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // Filter(Boolean) removes empty lines
    return fileContent.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (e) {
    // Return empty array if file doesn't exist or is empty
    return [];
  }
}

// --- API HANDLER ---

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Path to the shared data directory
  const dataDir = path.join(process.cwd(), '../../Simulation_Env/data-exchange');
  const metricsPath = path.join(dataDir, 'metrics.jsonl');
  
  // Read the data from the simulation
  const gpuNodes: GpuNode[] = readJsonlFile(metricsPath);

  if (gpuNodes.length === 0) {
    // If simulation isn't running, send an error
    return res.status(500).json({ error: 'Failed to read simulation metrics.' });
  }

  // --- THIS IS THE CORRECTED LINE ---
  // We explicitly type 'acc', 'node', 'sum', and 'gpu'
  const totalPower = gpuNodes.reduce((acc: number, node: GpuNode) => {
    const nodePower = node.gpus 
      ? node.gpus.reduce((sum: number, gpu: Gpu) => sum + gpu.power_watts, 0) 
      : 0;
    return acc + nodePower;
  }, 0);
  // --- END OF FIX ---

  // Construct the ClusterState object our frontend expects
  const clusterState = {
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    
    // --- Mock data for parts we haven't built in Workstream A ---
    login_nodes: [
      { node_name: 'dws-login-01 (API)', cores_total: 32, mem_total_gb: 110, cpu_util_percent: 15, mem_util_percent: 23, active_users: 25 }
    ],
    storage: [
      { mount_point: 'CEPH:/home (API)', usage_percent: 88.56, used_tib: 5.37, total_tib: 6.0 }
    ],
    slurm_queue_info: [
      { partition: 'gpu-vram-48gb (API)', cpu_free: 278, cpu_allocated: 314, gpu_free: 15, gpu_allocated: 25, mem_free_gb: 4487, mem_allocated_gb: 1118, interactive_jobs_running: 2, interactive_jobs_pending: 0, batch_jobs_running: 15, batch_jobs_pending: 0 }
    ],
    
    // --- Real data from the simulation ---
    gpu_nodes: gpuNodes,
  };

  res.status(200).json(clusterState);
}