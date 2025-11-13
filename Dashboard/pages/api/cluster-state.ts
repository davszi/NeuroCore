import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_draw_watts: number;
  power_limit_watts: number;
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
interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;
  gpus: Gpu[];
}
interface LoginNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  active_users: number;
}
interface StorageVolume {
  mount_point: string;
  usage_percent: number;
  used_tib: number;
  total_tib: number;
}
interface SlurmPartition {
  partition: string;
  cpu_free: number | null;
  cpu_allocated: number | null;
  gpu_free: number | null;
  gpu_allocated: number | null;
  mem_free_gb: number;
  mem_allocated_gb: number;
  interactive_jobs_running: number;
  interactive_jobs_pending: number;
  batch_jobs_running: number;
  batch_jobs_pending: number;
}
interface PolledNodeData {
  node_name: string;
  gpus: Gpu[];
  cpu_util_percent?: number;
  mem_util_percent?: number;
  active_users?: number;
}

// --- Real Commands (Unchanged) ---
const GPU_CMD = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`;
const HOST_CMD = `top -bn1 | grep '%Cpu(s)' | awk '{print 100 - $8}'; free -m | grep Mem | awk '{print $3, $2}'`;
const USERS_CMD = `who | wc -l`;
const SLURM_CMD = `sinfo -o "%.12P %.5C %.5a %.5I %.10m %.6G" --noheader`;

const STORAGE_CMD = "df -hT | grep -E 'ceph|nfs|/scratch'";
const STORAGE_CMD_backup = `bash -c 'echo "["; first=1; for dir in /scratch/*; do [ -d "$dir" ] || continue; user=$(basename "$dir"); used=$(du -sh "$dir" 2>/dev/null | awk "{print \$1}"); file_count=$(find "$dir" -type f 2>/dev/null | wc -l); [ $first -eq 0 ] && echo ","; first=0; echo "{ \"username\": \"$user\", \"used\": \"$used\", \"files\": $file_count }"; done; echo "]"'`;

/**
 * Helper function to run commands on a remote server
 */
async function pollNode(node: NodeConfig): Promise<PolledNodeData | null> {
  const ssh = new NodeSSH();
  const nodeData: PolledNodeData = { node_name: node.name, gpus: [] };

  try {
    // Connect using the new library's syntax
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: '', //  Remember to replace this!
    });

    // --- 1. Get GPU Stats ---
    // ℹThis library returns an object { stdout, stderr, code }
    const gpuResult = await ssh.execCommand(GPU_CMD);
    if (gpuResult.code === 0 && gpuResult.stdout.trim() !== '') {
      gpuResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.split(', ');
        if (parts.length >= 8) { 
          nodeData.gpus.push({
            gpu_id: parseInt(parts[0]),
            gpu_name: parts[1].trim(),
            utilization_percent: parseFloat(parts[2]),
            memory_used_mib: parseFloat(parts[3]),
            memory_total_mib: parseFloat(parts[4]),
            temperature_celsius: parseFloat(parts[5]),
            power_draw_watts: parseFloat(parts[6]),
            power_limit_watts: parseFloat(parts[7]),
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

    // --- 3. Get Active Users ---
    const usersResult = await ssh.execCommand(USERS_CMD);
    if (usersResult.code === 0 && usersResult.stdout.trim() !== '') {
      nodeData.active_users = parseInt(usersResult.stdout.trim());
    }
    
    // ✅ 3. Close the connection
    ssh.dispose();
    return nodeData;

  } catch (e) {
    // console.error(`Failed to poll node ${node.name}: ${(e as Error).message}`);
    ssh.dispose(); 
    return null; 
  }
}

/**
 * 2. Polls SLURM partition data
 */
async function pollSlurmData(node: NodeConfig): Promise<SlurmPartition[]> {
  const ssh = new NodeSSH();
  const slurmPartitions: SlurmPartition[] = [];

  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: '', //
    });

    const slurmResult = await ssh.execCommand(SLURM_CMD);
    if (slurmResult.code === 0 && slurmResult.stdout.trim() !== '') {
      slurmResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return;
        const totalCpus = parseInt(parts[1]);
        const allocCpus = parseInt(parts[2]);
        const idleCpus = parseInt(parts[3]);
        const totalMemMb = parseInt(parts[4]);
        const cpuAllocRatio = totalCpus > 0 ? allocCpus / totalCpus : 0;
        const memAllocated = (totalMemMb * cpuAllocRatio) / 1024;
        const memFree = (totalMemMb / 1024) - memAllocated;
        let gpuAllocated: number | null = null;
        let gpuFree: number | null = null;
        if(parts.length >= 6 && parts[5].includes('gpu:')) {
          try {
            gpuAllocated = parseInt(parts[5].split(':').pop() || '0');
            gpuFree = null; // sinfo doesn't easily show free
          } catch { gpuAllocated = null; }
        }
        slurmPartitions.push({
          partition: parts[0],
          cpu_free: idleCpus,
          cpu_allocated: allocCpus,
          gpu_free: gpuFree,
          gpu_allocated: gpuAllocated,
          mem_free_gb: Math.round(memFree),
          mem_allocated_gb: Math.round(memAllocated),
          interactive_jobs_running: 0, // ℹ️ Mocked, sinfo doesn't show this
          interactive_jobs_pending: 0,
          batch_jobs_running: 0,
          batch_jobs_pending: 0,
        });
      });
    }
    ssh.dispose();
    return slurmPartitions;
  } catch (e) {
    // console.error(`Failed to poll SLURM from ${node.name}: ${(e as Error).message}`);
    ssh.dispose();
    return [];
  }
}

/**
 * 3. Polls Storage volume data
 */
async function pollStorageData(node: NodeConfig): Promise<StorageVolume[]> {
  const ssh = new NodeSSH();
  const storageVolumes: StorageVolume[] = [];

  const parseToTib = (sizeStr: string): number => {
    const size = parseFloat(sizeStr);
    if (sizeStr.endsWith('T')) return size;
    if (sizeStr.endsWith('G')) return size / 1024;
    if (sizeStr.endsWith('M')) return size / 1024 / 1024;
    return 0;
  };

  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: '', //
    });

    const storageResult = await ssh.execCommand(STORAGE_CMD);

    if (storageResult.code === 0 && storageResult.stdout.trim() !== '') {
      storageResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) return;
        storageVolumes.push({
          mount_point: parts[6], 
          total_tib: parseToTib(parts[2]),
          used_tib: parseToTib(parts[3]),
          usage_percent: parseFloat(parts[5].replace('%', '')),
        });
      });
    }
    ssh.dispose();
    return storageVolumes;
  } catch (e) {
    // console.error(`Failed to poll Storage from ${node.name}: ${(e as Error).message}`);
    ssh.dispose();
    return [];
  }
}

/**
 * The main API Handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  // 1. Read the config files
  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  const inventoryPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');
  let nodesConfig, gpuInventory;
  try {
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    gpuInventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8')) as GpuInventory;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config files.', details: (e as Error).message });
  }

  // 2. Poll all data sources in parallel
  const nodePollPromises = nodesConfig.nodes.map(pollNode);
  // ℹ️ We assume the first node in the list can run SLURM and Storage commands
  const slurmPromise = pollSlurmData(nodesConfig.nodes[0]); 
  const storagePromise = pollStorageData(nodesConfig.nodes[0]);
  
  const [nodeResults, slurmData, storageData] = await Promise.all([
    Promise.all(nodePollPromises),
    slurmPromise,
    storagePromise,
  ]);
  
  const polledNodes = nodeResults.filter((r): r is PolledNodeData => r !== null);

  // 3. Split nodes into GPU nodes and Login nodes
  const liveGpuNodes: GpuNode[] = [];
  const liveLoginNodes: LoginNode[] = [];

  polledNodes.forEach((nodeData) => {
    const staticData = gpuInventory.nodes[nodeData.node_name] || gpuInventory.defaults;
    
    // We identify GPU nodes as any node that successfully returned GPU data
    if (nodeData.gpus && nodeData.gpus.length > 0) {
      liveGpuNodes.push({
        ...staticData,
        ...nodeData,
        gpu_summary_name: staticData.gpu_name,
        cpu_util_percent: nodeData.cpu_util_percent || 0,
        mem_util_percent: nodeData.mem_util_percent || 0,
        gpus: nodeData.gpus,
      });
    } else {
      // No GPUs found? We'll call it a Login Node.
      liveLoginNodes.push({
        node_name: nodeData.node_name,
        cores_total: staticData.cores_total,
        mem_total_gb: staticData.mem_total_gb,
        cpu_util_percent: nodeData.cpu_util_percent || 0,
        mem_util_percent: nodeData.mem_util_percent || 0,
        active_users: nodeData.active_users || 0,
      });
    }
  });

  // 4. Calculate total power
  const totalPower = liveGpuNodes.reduce((acc: number, node: GpuNode) => {
      const nodePower = (node.gpus || []).reduce((sum: number, gpu: Gpu) => {
          return sum + (gpu.power_draw_watts || 0);
      }, 0);
      return acc + nodePower;
  }, 0);

  // 5. Build the final API response
  const clusterState = {
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    
    // --- REAL DATA ---
    login_nodes: liveLoginNodes,
    storage: storageData.length > 0 ? storageData : [
      { mount_point: "CEPH:/home (Fallback)", used_tib: 0, total_tib: 0, usage_percent: 0 }
    ],
    slurm_queue_info: slurmData.length > 0 ? slurmData : [
      { partition: 'cpu (Fallback)', cpu_free: 0, cpu_allocated: 0, mem_free_gb: 0, mem_allocated_gb: 0, gpu_free: null, gpu_allocated: null, interactive_jobs_running: 0, interactive_jobs_pending: 0, batch_jobs_running: 0, batch_jobs_pending: 0 }
    ],
    gpu_nodes: liveGpuNodes,
  };

  res.status(200).json(clusterState);
}