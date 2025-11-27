import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

// --- Interfaces (unchanged) ---
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
interface NodeDataType {
  node_name: string;
  cores_total?: number;
  mem_total_gb?: number;
  cpu_util_percent?: number;
  mem_util_percent?: number;
  gpu_summary_name?: string;
  active_users?: number;
  active_usernames?: string[];
  gpus?: Gpu[];
}

// --- Commands ---
const GPU_CMD = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`;
const CORES_CMD = `nproc`;
const MEM_CMD = `cat /proc/meminfo`;
const USERS_CMD = `who | wc -l`;
const USERS_LIST_CMD = `who | awk '{print $1}'`;

// --- Polling a single node ---
async function pollNode(node: NodeConfig, password: string): Promise<NodeDataType | null> {
  const ssh = new NodeSSH();
  const nodeData: NodeDataType = { node_name: node.name, gpus: [] };

  try {
    console.log(`[node-state] [${node.name}] Connecting using password...`);
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: "WeAreNeuroCore",
    });
    console.log(`[node-state] [${node.name}] Connected.`);

    // GPU
    try {
      const gpuResult = await ssh.execCommand(GPU_CMD);
      if (gpuResult.code === 0 && gpuResult.stdout.trim() !== '') {
        gpuResult.stdout.trim().split('\n').forEach((line: string) => {
          const parts = line.split(', ');
          if (parts.length >= 8) { 
            nodeData.gpus?.push({
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
    } catch (e) {
      console.warn(`[node-state] [${node.name}] GPU_CMD failed (login node or no GPU).`);
    }

    // CPU cores
    try {
      const coresResult = await ssh.execCommand(CORES_CMD);
      if (coresResult.code === 0) nodeData.cores_total = parseInt(coresResult.stdout.trim());
    } catch (e) { console.error(`[node-state] [${node.name}] CORES_CMD failed.`); }

    // Memory
    try {
      const memResult = await ssh.execCommand(MEM_CMD);
      if (memResult.code === 0) {
        const lines = memResult.stdout.trim().split('\n');
        let total_kib = 0, available_kib = 0;
        lines.forEach(line => {
          if (line.startsWith("MemTotal:")) total_kib = parseInt(line.split(":")[1].trim());
          if (line.startsWith("MemAvailable:")) available_kib = parseInt(line.split(":")[1].trim());
        });
        if (total_kib > 0) {
          const used_kib = total_kib - available_kib;
          nodeData.mem_total_gb = Math.round(total_kib / (1024 * 1024));
          nodeData.mem_util_percent = (used_kib / total_kib) * 100;
        }
      }
    } catch (e) { console.error(`[node-state] [${node.name}] MEM_CMD failed.`); }

    // Active users (count)
      try {
        const usersResult = await ssh.execCommand(USERS_CMD);
        if (usersResult.code === 0) {
          nodeData.active_users = parseInt(usersResult.stdout.trim());
        }
      } catch (e) { 
        console.error(`[node-state] [${node.name}] USERS_CMD failed.`); 
      }

      // Active usernames (list)
      try {
        const usersListResult = await ssh.execCommand(USERS_LIST_CMD);
        if (usersListResult.code === 0) {
          nodeData.active_usernames = usersListResult.stdout
            .trim()
            .split('\n')
            .map(u => u.trim())
            .filter(Boolean);
        }
      } catch (e) {
        console.error(`[node-state] [${node.name}] USERS_LIST_CMD failed.`);
      }


    ssh.dispose();
    return nodeData;

  } catch (e) {
    console.error(`[node-state] [${node.name}] Failed to poll node: ${(e as Error).message}`);
    ssh.dispose();
    return null;
  }
}

// --- API Handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log(`--- [node-state handler] Request received at ${new Date().toISOString()} ---`);

  let password = "WeAreNeuroCore"; // 🔥 Password only
  let nodesConfig: { nodes: NodeConfig[] }, gpuInventory: GpuInventory;

  try {
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    const inventoryPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    gpuInventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8')) as GpuInventory;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read config files.', details: (e as Error).message });
  }

  const nodePollPromises = nodesConfig.nodes.map(node => pollNode(node, password));
  const nodeResults = await Promise.all(nodePollPromises);

  const polledNodes = nodeResults.filter((r): r is NodeDataType => r !== null);
  const liveGpuNodes: NodeDataType[] = [];
  const liveLoginNodes: NodeDataType[] = [];

  polledNodes.forEach(nodeData => {
    const staticData = gpuInventory.nodes[nodeData.node_name] || gpuInventory.defaults;
    const mergedData = { ...staticData, ...nodeData };
    if (mergedData.gpus && mergedData.gpus.length > 0) {
      liveGpuNodes.push({ ...mergedData, gpu_summary_name: staticData.gpu_name });
    } else {
      liveLoginNodes.push({
        node_name: mergedData.node_name,
        cores_total: mergedData.cores_total,
        mem_total_gb: mergedData.mem_total_gb,
        cpu_util_percent: mergedData.cpu_util_percent || 0,
        mem_util_percent: mergedData.mem_util_percent || 0,
        active_users: mergedData.active_users || 0,
        active_usernames: mergedData.active_usernames || [],
      });
    }
  });

  const totalPower = liveGpuNodes.reduce((acc, node) => {
    const nodePower = (node.gpus || []).reduce((sum, gpu) => sum + (gpu.power_draw_watts || 0), 0);
    return acc + nodePower;
  }, 0);

  const responsePayload = {
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    login_nodes: liveLoginNodes,
    gpu_nodes: liveGpuNodes,
  };

  const snapshotDir = path.join(process.cwd(), "data/node-history");

  // Create directory if missing
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  // Create file like: snapshot-2025-11-26T20-23-14.json
  const fileName = `snapshot-${new Date()
    .toISOString()
    .replace(/:/g, "-")}.json`;

  fs.writeFileSync(
    path.join(snapshotDir, fileName),
    JSON.stringify(responsePayload, null, 2)
  );

  console.log(`[node-state] Saved snapshot: ${fileName}`);

  

  res.status(200).json({
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    login_nodes: liveLoginNodes,
    gpu_nodes: liveGpuNodes,
  });
}
