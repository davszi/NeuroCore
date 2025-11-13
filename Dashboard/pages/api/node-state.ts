import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

// --- All interfaces are unchanged ---
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
  gpus?: Gpu[];
}

// --- All commands are unchanged ---
const GPU_CMD = `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`;
const CORES_CMD = `nproc`;
const MEM_CMD = `cat /proc/meminfo`; 
const USERS_CMD = `who | wc -l`;


async function pollNode(
  node: NodeConfig,
  privateKey: string
): Promise<NodeDataType | null> {
  
  const ssh = new NodeSSH();
  const nodeData: NodeDataType = { node_name: node.name, gpus: [] };
  
  try {
    // 1. Connect using SSH Key
    console.log(`[node-state] [${node.name}] Connecting to ${node.user}@${node.host} using SSH key...`);
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      privateKey: privateKey,
    });
    console.log(`[node-state] [${node.name}] Connected.`);

    // --- 2. Execute Commands Separately ---
    // (This entire block is unchanged and works)

    // --- GPU ---
    try {
      console.log(`[node-state] [${node.name}] Running GPU_CMD...`);
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
      console.warn(`[node-state] [${node.name}] WARN: GPU_CMD failed (This is OK if it's a login node). ${e}`);
    }

    // --- CORES ---
    try {
      console.log(`[node-state] [${node.name}] Running CORES_CMD...`);
      const coresResult = await ssh.execCommand(CORES_CMD);
      if (coresResult.code === 0) {
        nodeData.cores_total = parseInt(coresResult.stdout.trim());
      }
    } catch (e) {
       console.error(`[node-state] [${node.name}] ERROR: CORES_CMD failed. ${e}`);
    }

    // --- MEMORY ---
    try {
      console.log(`[node-state] [${node.name}] Running MEM_CMD...`);
      const memResult = await ssh.execCommand(MEM_CMD);
      if (memResult.code === 0) {
        const lines = memResult.stdout.trim().split('\n');
        let total_kib = 0;
        let available_kib = 0;
        
        lines.forEach(line => {
          if (line.startsWith("MemTotal:")) {
            total_kib = parseInt(line.split(":")[1].trim());
          }
          if (line.startsWith("MemAvailable:")) {
            available_kib = parseInt(line.split(":")[1].trim());
          }
        });

        if (total_kib > 0) {
          const used_kib = total_kib - available_kib;
          nodeData.mem_total_gb = Math.round(total_kib / (1024 * 1024));
          nodeData.mem_util_percent = (used_kib / total_kib) * 100;
        }
      }
    } catch (e) {
      console.error(`[node-state] [${node.name}] ERROR: MEM_CMD failed. ${e}`);
    }

    // --- USERS ---
    try {
      console.log(`[node-state] [${node.name}] Running USERS_CMD...`);
      const usersResult = await ssh.execCommand(USERS_CMD);
      if (usersResult.code === 0) {
        nodeData.active_users = parseInt(usersResult.stdout.trim());
      }
    } catch (e) {
      console.error(`[node-state] [${node.name}] ERROR: USERS_CMD failed. ${e}`);
    }

    // --- 3. All Done ---
    console.log(`[node-state] [${node.name}] ✅ Successfully polled node.`);
    console.log(JSON.stringify(nodeData, null, 2));
    
    ssh.dispose();
    return nodeData;

  } catch (e) {
    const error = e as Error;
    console.error(`!!! [node-state] [pollNode] ❌ FAILED to poll node: ${node.name} - ${error.message}`);
    ssh.dispose();
    return null;
  }
}

/**
 * The main API Handler for NODE-STATE
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  console.log(`\n\n--- [node-state handler] Received request for /api/node-state at ${new Date().toISOString()} ---`);
  
  let privateKey: string | undefined;
  let nodesConfig, gpuInventory;

  try {
    // --- [CHANGE 2 of 2] ---
    // 1. Read the SSH private key from Environment Variables
    console.log("[node-state handler] Reading SSH private key from environment...");
    
    privateKey = process.env.SSH_PRIVATE_KEY; 
    
    if (!privateKey) {
      throw new Error("Missing SSH_PRIVATE_KEY environment variable. Cannot authenticate. Did you create .env.local and restart the server?");
    }

    // This is CRITICAL. Environment variables (especially from .env.local) 
    // mess up line breaks. This line fixes the key's formatting.
    privateKey = privateKey.replace(/\\n/g, '\n');

    console.log("[node-state handler] Successfully loaded private key from environment.");
    // --- [ END CHANGE ] ---
    
    // 2. Read the config files
    // Using the '../config/' path from your successful logs.
    console.log("[node-state handler] Reading config files from ../config/ ...");
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    const inventoryPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');
    
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    console.log("[node-state handler] Successfully read nodes.yaml.");
    
    gpuInventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8')) as GpuInventory;
    console.log("[node-state handler] Successfully read gpu_inventory.yaml.");

  } catch (e) {
    const error = e as Error;
    console.error("!!! [node-state handler] ❌ CRITICAL ERROR IN MAIN HANDLER (SETUP) !!!");
    console.error(`!!! Error Message: ${error.message}`);
    console.error(`!!! Error Stack: ${error.stack}`);
    return res.status(500).json({ error: 'Failed to read SSH key or config files.', details: error.message });
  }

  // 3. Poll all data sources in parallel
  console.log("[node-state handler] Starting to poll all nodes in parallel...");
  const nodePollPromises = nodesConfig.nodes.map(node => pollNode(node, privateKey));
  const nodeResults = await Promise.all(nodePollPromises);
  console.log("[node-state handler] All polling promises have settled.");

  const polledNodes = nodeResults.filter((r): r is NodeDataType => r !== null);
  console.log(`[node-state handler] Successfully polled ${polledNodes.length} nodes. Failed: ${nodeResults.length - polledNodes.length}`);

  // 4. Split nodes into GPU nodes and Login nodes
  console.log("[node-state handler] Merging live data with static inventory...");
  const liveGpuNodes: NodeDataType[] = [];
  const liveLoginNodes: NodeDataType[] = [];

  polledNodes.forEach((nodeData) => {
    const staticData = gpuInventory.nodes[nodeData.node_name] || gpuInventory.defaults;
    const mergedData = { ...staticData, ...nodeData }; // Live data overrides static data

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
      });
    }
  });
  console.log("[node-state handler] Data merge complete.");

  // 5. Calculate total power
  const totalPower = liveGpuNodes.reduce((acc: number, node: NodeDataType) => {
    const nodePower = (node.gpus || []).reduce((sum: number, gpu: Gpu) => {
      return sum + (gpu.power_draw_watts || 0);
    }, 0);
    return acc + nodePower;
  }, 0);

  // 6. Build the final API response
  console.log(`[node-state handler] Sending successful 200 response. Total power: ${totalPower}W`);
  res.status(200).json({
    last_updated_timestamp: new Date().toISOString(),
    total_power_consumption_watts: totalPower,
    login_nodes: liveLoginNodes,
    gpu_nodes: liveGpuNodes,
  });
}