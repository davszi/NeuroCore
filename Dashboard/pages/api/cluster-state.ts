import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

// --- (All interfaces remain the same) ---
interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_draw_watts: number;
}
interface GpuInventoryNode {
  gpu_name: string;
  power_limit_watts: number;
  cores_total: number;
  mem_total_gb: number;
}
interface GpuInventory {
  defaults: GpuInventoryNode;
  nodes: { [nodeName: string]: GpuInventoryNode };
}
interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
}
// ℹ️ This interface is strict: cpu_util_percent must be a number.
interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;
  gpus: Gpu[];
}
// ℹ️ This interface is flexible: cpu_util_percent can be undefined.
interface PolledNodeData {
  node_name: string;
  gpus: Gpu[];
  cpu_util_percent?: number;
  mem_util_percent?: number;
}

// --- Real Commands (Unchanged) ---
const GPU_CMD = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits`;
const HOST_CMD = `top -bn1 | grep '%Cpu(s)' | awk '{print 100 - $8}'; free -m | grep Mem | awk '{print $3, $2}'`;

/**
 * Helper function to run a command on a remote server
 */
async function pollNode(node: NodeConfig): Promise<PolledNodeData | null> {
  const ssh = new NodeSSH();
  const nodeData: PolledNodeData = { node_name: node.name, gpus: [] };

  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: 'phie9aw7Lee7', // ❗️ Remember to replace this!
    });

    // --- 1. Get GPU Stats ---
    const gpuResult = await ssh.execCommand(GPU_CMD);
    if (gpuResult.code === 0 && gpuResult.stdout.trim() !== '') {
      gpuResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.split(', ');
        if (parts.length >= 7) { 
          nodeData.gpus.push({
            gpu_id: parseInt(parts[0]),
            gpu_name: parts[1].trim(),
            utilization_percent: parseFloat(parts[2]),
            memory_used_mib: parseFloat(parts[3]),
            memory_total_mib: parseFloat(parts[4]),
            temperature_celsius: parseFloat(parts[5]),
            power_draw_watts: parseFloat(parts[6]),
          });
        }
      });
    }

    // --- 2. Get Host (CPU/MEM) Stats ---
    const hostResult = await ssh.execCommand(HOST_CMD);
    if (hostResult.code === 0 && hostResult.stdout.trim() !== '') {
      const lines = hostResult.stdout.trim().split('\n');
      if (lines.length >= 2) {
        const cpuLine = lines[0];
        const memLine = lines[1];
        const cpu_util_percent = parseFloat(cpuLine);
        const [mem_used_mib, mem_total_mib] = memLine.split(' ').map(parseFloat);
        
        nodeData.cpu_util_percent = cpu_util_percent;
        nodeData.mem_util_percent = (mem_used_mib / mem_total_mib) * 100;
      }
    }
    
    ssh.dispose();
    return nodeData;

  } catch (e) {
    console.error(`Failed to poll node ${node.name}: ${(e as Error).message}`);
    ssh.dispose(); 
    return null;
  }
}

/**
 * The main API Handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  // (Unchanged: Reading config files)
  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  const inventoryPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');

  let nodesConfig, gpuInventory;
  try {
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    gpuInventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8')) as GpuInventory;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config files.', details: (e as Error).message });
  }

  // (Unchanged: Polling nodes)
  const pollPromises = nodesConfig.nodes.map(pollNode);
  const results = await Promise.all(pollPromises);

  // 3. Filter out failed nodes and combine with static inventory
  const liveGpuNodes: GpuNode[] = results
    .filter((r): r is PolledNodeData => r !== null) 
    .map((nodeData: PolledNodeData) => {
      const staticData = gpuInventory.nodes[nodeData.node_name] || gpuInventory.defaults;
      
      // ✅ --- THIS IS THE FIX ---
      // We are now creating the final GpuNode object manually
      // and providing default values (0) for any missing stats.
      // This guarantees it matches the 'GpuNode' interface.
      return {
        // Static data from inventory
        node_name: nodeData.node_name,
        cores_total: staticData.cores_total,
        mem_total_gb: staticData.mem_total_gb,
        gpu_summary_name: staticData.gpu_name,
        
        // Polled data (with fallbacks)
        gpus: nodeData.gpus || [],
        cpu_util_percent: nodeData.cpu_util_percent || 0, // ⬅️ Default to 0
        mem_util_percent: nodeData.mem_util_percent || 0, // ⬅️ Default to 0
      };
      // ⬆️ --- END OF FIX --- ⬆️
  });

  // (Unchanged: .reduce() for totalPower)
  const totalPower = liveGpuNodes.reduce((acc: number, node: GpuNode) => {
      const nodePower = (node.gpus || []).reduce((sum: number, gpu: Gpu) => {
          return sum + (gpu.power_draw_watts || 0);
      }, 0);
      return acc + nodePower;
  }, 0);

  // (Unchanged: Building the final response)
  const clusterState = {
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    login_nodes: [
      { node_name: 'cloud-243.rz...', cores_total: 8, mem_total_gb: 32, cpu_util_percent: 10, mem_util_percent: 20, active_users: 5 }
    ],
    storage: [ /* ... Mocked storage ... */ ],
    slurm_queue_info: [ /* ... Mocked SLURM ... */ ],
    gpu_nodes: liveGpuNodes,
  };

  res.status(200).json(clusterState);
}