import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { runCommand } from '@/lib/ssh';
import { NodeConfig, GpuNode, LoginNode, Gpu } from '@/types/cluster';

// Interface for the static inventory file (gpu_inventory.yaml)
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

/**
 * Polls a single node for all hardware stats in ONE SSH connection.
 */
async function getNodeData(node: NodeConfig) {
  // We combine commands using specific delimiters to parse them later.
  // This avoids establishing 4 separate SSH handshakes.
  const DELIMITER = "---SECTION---";
  
  const cmd = [
    // 1. GPU Data
    `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`,
    `echo "${DELIMITER}"`,
    // 2. CPU Cores
    `nproc`,
    `echo "${DELIMITER}"`,
    // 3. Memory (Total and Available)
    `grep -E 'MemTotal|MemAvailable' /proc/meminfo`,
    `echo "${DELIMITER}"`,
    // 4. Active Users count
    `who | wc -l`,
    `echo "${DELIMITER}"`,
    // 5. Active Usernames list
    `who | awk '{print $1}' | sort | uniq`
  ].join(';');

  const rawOutput = await runCommand(node, cmd);
  if (!rawOutput) return null;

  const sections = rawOutput.split(DELIMITER).map(s => s.trim());

  // --- Parse GPU ---
  const gpus: Gpu[] = [];
  if (sections[0]) {
    sections[0].split('\n').forEach(line => {
      const parts = line.split(', ');
      if (parts.length >= 8) {
        gpus.push({
          gpu_id: parseInt(parts[0]),
          gpu_name: parts[1],
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

  // --- Parse CPU ---
  const cores_total = parseInt(sections[1] || '0');

  // --- Parse Memory ---
  let mem_total_gb = 0;
  let mem_util_percent = 0;
  if (sections[2]) {
    const memLines = sections[2].split('\n');
    let totalKb = 0;
    let availKb = 0;
    memLines.forEach(l => {
      if (l.includes('MemTotal')) totalKb = parseInt(l.split(':')[1]);
      if (l.includes('MemAvailable')) availKb = parseInt(l.split(':')[1]);
    });
    if (totalKb > 0) {
      mem_total_gb = Math.round(totalKb / (1024 * 1024));
      mem_util_percent = ((totalKb - availKb) / totalKb) * 100;
    }
  }

  // --- Parse Users ---
  const active_users = parseInt(sections[3] || '0');
  const active_usernames = sections[4] ? sections[4].split('\n').filter(Boolean) : [];

  return {
    node_name: node.name,
    cores_total,
    mem_total_gb,
    cpu_util_percent: 0, // Ideally needs 'top' or 'mpstat', leaving 0 as placeholder for speed
    mem_util_percent,
    active_users,
    active_usernames,
    gpus
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    const inventoryPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');

    if (!fs.existsSync(nodesPath) || !fs.existsSync(inventoryPath)) {
      return res.status(500).json({ error: 'Configuration files missing' });
    }

    const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    const gpuInventory = yaml.load(fs.readFileSync(inventoryPath, 'utf8')) as GpuInventory;

    // Run in parallel
    const nodePromises = nodesConfig.nodes.map(node => getNodeData(node));
    const results = await Promise.all(nodePromises);

    const liveGpuNodes: GpuNode[] = [];
    const liveLoginNodes: LoginNode[] = [];
    let totalPower = 0;

    results.forEach(data => {
      if (!data) return;

      // Merge static inventory data with live data
      const staticData = gpuInventory.nodes[data.node_name] || gpuInventory.defaults;
      
      // Use live data if available, fallback to static
      const finalCores = data.cores_total || staticData.cores_total;
      const finalMem = data.mem_total_gb || staticData.mem_total_gb;

      if (data.gpus && data.gpus.length > 0) {
        // It is a GPU node
        data.gpus.forEach(g => totalPower += g.power_draw_watts);
        liveGpuNodes.push({
          node_name: data.node_name,
          cores_total: finalCores,
          mem_total_gb: finalMem,
          cpu_util_percent: data.cpu_util_percent,
          mem_util_percent: data.mem_util_percent,
          gpu_summary_name: staticData.gpu_name,
          gpus: data.gpus,
          active_users: data.active_users,
          active_usernames: data.active_usernames
        });
      } else {
        // It is a Login/CPU node
        liveLoginNodes.push({
          node_name: data.node_name,
          cores_total: finalCores,
          mem_total_gb: finalMem,
          cpu_util_percent: data.cpu_util_percent,
          mem_util_percent: data.mem_util_percent,
          active_users: data.active_users,
          active_usernames: data.active_usernames
        });
      }
    });

    const responsePayload = {
      last_updated_timestamp: new Date().toISOString(),
      total_power_consumption_watts: Math.round(totalPower),
      login_nodes: liveLoginNodes,
      gpu_nodes: liveGpuNodes,
    };

    // --- HISTORY SAVING LOGIC ---
    // Only save to disk if the query param ?save=true is present.
    // This prevents disk thrashing on every poll.
    if (req.query.save === 'true') {
      const snapshotDir = path.join(process.cwd(), "data/node-history");
      if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
      
      const fileName = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      fs.writeFileSync(path.join(snapshotDir, fileName), JSON.stringify(responsePayload));
      console.log(`[History] Saved snapshot: ${fileName}`);
    }

    res.status(200).json(responsePayload);

  } catch (e) {
    console.error("Node State Error:", e);
    res.status(500).json({ error: (e as Error).message });
  }
}