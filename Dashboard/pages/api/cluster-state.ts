import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { runCommand } from '@/lib/ssh';
import { NodeConfig, SlurmPartition, StorageVolume, UserStorage } from '@/types/cluster';

// --- Helper: Get SLURM Queue Data ---
async function getSlurmData(node: NodeConfig): Promise<SlurmPartition[]> {
  const CMD = `sinfo -o "%.12P %.5C %.5a %.5I %.10m %.6G" --noheader`;
  const output = await runCommand(node, CMD);
  const partitions: SlurmPartition[] = [];

  if (output && output.trim()) {
    output.trim().split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return;

      const totalCpus = parseInt(parts[1]) || 0;
      const allocCpus = parseInt(parts[2]) || 0;
      const idleCpus = parseInt(parts[3]) || 0;
      const totalMemMb = parseInt(parts[4]) || 0;

      const cpuAllocRatio = totalCpus > 0 ? allocCpus / totalCpus : 0;
      const memAllocated = (totalMemMb * cpuAllocRatio) / 1024;
      const memFree = (totalMemMb / 1024) - memAllocated;

      let gpuAlloc = null;
      if (parts.length >= 6 && parts[5].includes('gpu:')) {
        try {
          gpuAlloc = parseInt(parts[5].split(':').pop() || '0');
        } catch { }
      }

      partitions.push({
        partition: parts[0],
        cpu_free: idleCpus,
        cpu_allocated: allocCpus,
        gpu_free: null,
        gpu_allocated: gpuAlloc,
        mem_free_gb: Math.round(memFree),
        mem_allocated_gb: Math.round(memAllocated),
        interactive_jobs_running: 0,
        interactive_jobs_pending: 0,
        batch_jobs_running: 0,
        batch_jobs_pending: 0,
      });
    });
  }
  return partitions;
}

// --- Helper: Get Global Storage Volumes ---
async function getStorageData(node: NodeConfig): Promise<StorageVolume[]> {
  const CMD = "df -hT | grep -E 'ceph|nfs|/scratch'";
  const output = await runCommand(node, CMD);
  const volumes: StorageVolume[] = [];

  const parseToTib = (str: string) => {
    const val = parseFloat(str);
    if (str.includes('T')) return val;
    if (str.includes('G')) return val / 1024;
    return 0;
  };

  if (output && output.trim()) {
    output.trim().split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) return;
      volumes.push({
        mount_point: parts[6],
        total_tib: parseToTib(parts[2]),
        used_tib: parseToTib(parts[3]),
        usage_percent: parseFloat(parts[5].replace('%', '')),
      });
    });
  }
  return volumes;
}

// --- Helper: Get Per-User Storage Usage (CRITICAL FIX) ---
async function getUserStorageData(node: NodeConfig, targetDir: string): Promise<UserStorage[]> {
  // We use a simpler command structure. 
  // We strictly ignore errors for 'du' so it exits with 0 even if permission denied occurs on subfiles.
  // We echo "[]" manually in case of total failure.
  
  const CMD = `
    echo "["
    first=1
    if [ -d "${targetDir}" ]; then
      for d in ${targetDir}/*; do
        if [ -d "$d" ]; then
          user=$(basename "$d")
          # "du -sk" gives size in KB. "2>/dev/null" hides errors. "|| echo 0" ensures it doesn't fail.
          vals=$(du -sk "$d" 2>/dev/null | cut -f1 || echo 0)
          files=$(find "$d" -maxdepth 3 -type f 2>/dev/null | wc -l || echo 0)
          
          if [ "$first" -eq 0 ]; then echo ","; fi
          first=0
          echo "{ \\"username\\": \\"$user\\", \\"used_kb\\": $vals, \\"files\\": $files }"
        fi
      done
    fi
    echo "]"
  `.replace(/\n/g, ' '); // Inline it for SSH

  try {
    const output = await runCommand(node, CMD);

    // 1. Strict Null Check
    if (!output || output.trim() === "") {
      console.warn(`[cluster-state] Empty output for ${targetDir} (Exit Code 1 likely)`);
      return [];
    }

    // 2. Locate JSON bounds (sometimes SSH motd/banners get mixed in)
    const startIndex = output.indexOf('[');
    const endIndex = output.lastIndexOf(']');
    
    if (startIndex === -1 || endIndex === -1) {
      console.warn(`[cluster-state] Invalid JSON structure received for ${targetDir}`);
      return [];
    }

    const jsonString = output.substring(startIndex, endIndex + 1);

    // 3. Parse
    const json = JSON.parse(jsonString);
    
    return json.map((u: any) => ({
      username: u.username,
      used_storage_space_gb: u.used_kb ? Math.round((u.used_kb / 1024 / 1024) * 100) / 100 : 0,
      total_files: u.files || 0,
      mount_point: targetDir
    }));

  } catch (e) {
    // 4. Catch-all: If anything fails, return empty array. DO NOT CRASH.
    console.error(`[cluster-state] Failed to parse/fetch storage for ${targetDir}:`, (e as Error).message);
    return [];
  }
}

// --- Main Handler ---
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. Load Config
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    if (!fs.existsSync(nodesPath)) {
        throw new Error('Nodes config missing');
    }
    
    const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
    const headNode = nodesConfig.nodes[0]; // Assume first node is Head Node

    // 2. Determine Target Directory for User Storage
    const { volume } = req.query as { volume?: string };
    
    let targetDir = '/scratch'; 
    if (volume === 'home' || volume === 'windows') {
       return res.status(403).json({ error: "Access to home directory stats is restricted." });
    }
    if (volume && volume.startsWith('/')) targetDir = volume;

    // 3. Execute Parallel Commands
    const [slurmData, storageData, userStorageData] = await Promise.all([
      getSlurmData(headNode),
      getStorageData(headNode),
      getUserStorageData(headNode, targetDir)
    ]);

    // 4. Construct Response
    const clusterState = {
      last_updated_timestamp: new Date().toISOString(),
      slurm_queue_info: slurmData,
      storage: storageData,
      user_storage: userStorageData,
      // We fill these with empty/defaults because this API endpoint
      // is specifically for Cluster State, not Node State.
      login_nodes: [], 
      gpu_nodes: []
    };

    res.status(200).json(clusterState);

  } catch (e) {
    console.error("Critical Error in Cluster State API:", e);
    res.status(500).json({ error: (e as Error).message });
  }
}