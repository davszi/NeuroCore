import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// --- (Your Gpu and GpuNode interfaces are here) ---
interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_util_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_draw_watts: number; 
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


// Helper function
function readJsonlFile(filePath: string): any[] {
  try {
    // ✅ Check if file exists. If not, it's not an error, just return empty.
    if (!fs.existsSync(filePath)) {
      console.warn(`[API /api/cluster-state] File not found: ${filePath}. Returning empty array.`);
      return [];
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(Boolean); // Filter empty lines

    // ✅ Check if file is empty. Not an error, just return empty.
    if (lines.length === 0) {
      console.warn(`[API /api/cluster-state] File is empty: ${filePath}. Returning empty array.`);
      return [];
    }
    
    return lines.map(line => JSON.parse(line));
  } catch (e) {
    console.error(`[API /api/cluster-state] Failed to read or parse ${filePath}:`, e);
    return []; // ✅ Return empty on any error
  }
}

// --- API HANDLER ---
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // ℹ️ 1. Get the data path from an environment variable (set in docker-compose)
  //    2. If it's not set, fall back to the local path (for when you run 'npm run dev')
  const dataDir = process.env.DATA_PATH || path.join(process.cwd(), '../infrastructure/data');
  const metricsPath = path.join(dataDir, 'metrics.jsonl');
  
  const gpuNodes: GpuNode[] = readJsonlFile(metricsPath);

  const totalPower = gpuNodes.reduce((acc: number, node: GpuNode) => {
    const nodePower = node.gpus 
      ? node.gpus.reduce((sum: number, gpu: Gpu) => sum + (gpu.power_draw_watts || 0), 0) // Use power_draw_watts
      : 0;
    return acc + nodePower;
  }, 0);

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
    
    // --- Real data from the simulation (or empty array) ---
    gpu_nodes: gpuNodes,
  };

  res.status(200).json(clusterState);
}