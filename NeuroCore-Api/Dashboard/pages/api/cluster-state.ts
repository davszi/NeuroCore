import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

// --- Interface Definitions ---
interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
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
interface UserStorage {
  username: string;
  used_storage_space_gb: number;
  total_files: number;
  mount_point: string;
}

// --- Commands ---
const SLURM_CMD = `sinfo -o "%.12P %.5C %.5a %.5I %.10m %.6G" --noheader`;
const STORAGE_CMD = "df -hT | grep -E 'ceph|nfs|/scratch'";

/**
 * 2. Polls SLURM partition data
 */
async function pollSlurmData(
  node: NodeConfig,
  password: string
): Promise<SlurmPartition[]> {
  const ssh = new NodeSSH();
  const slurmPartitions: SlurmPartition[] = [];

  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: ""
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

        if (parts.length >= 6 && parts[5].includes('gpu:')) {
          try {
            gpuAllocated = parseInt(parts[5].split(':').pop() || '0');
            gpuFree = null;
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
          interactive_jobs_running: 0,
          interactive_jobs_pending: 0,
          batch_jobs_running: 0,
          batch_jobs_pending: 0,
        });
      });
    }

    ssh.dispose();
    return slurmPartitions;

  } catch (e) {
    console.error(`[cluster-state] ❌ Failed to poll SLURM from ${node.name}: ${(e as Error).message}`);
    ssh.dispose();
    return [];
  }
}

/**
 * 3. Polls Storage volume data
 */
async function pollStorageData(
  node: NodeConfig,
  password: string
): Promise<StorageVolume[]> {
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
      password: ""
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
    console.error(`[cluster-state] ❌ Failed to poll Storage from ${node.name}: ${(e as Error).message}`);
    ssh.dispose();
    return [];
  }
}

/**
 * 4. Polls User Storage data
 */
async function pollUserStorageData(
  node: NodeConfig,
  password: string,
  targetDir?: string
): Promise<UserStorage[]> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: ""
    });

    const dirsToCheck = targetDir
      ? [targetDir]
      : ['/scratch', '/home', '/windows-home'];

    const allData: UserStorage[] = [];

    for (const dir of dirsToCheck) {
      const command = `/bin/bash -c 'echo "["; first=1; for d in ${dir}/*; do [ -d "$d" ] || continue; user=$(basename "$d"); used=$(du -sh "$d" 2>/dev/null | cut -f1); file_count=$(find "$d" -type f 2>/dev/null | wc -l); [ $first -eq 0 ] && echo ","; first=0; echo "{ \\"username\\": \\"$user\\", \\"used\\": \\"$used\\", \\"files\\": $file_count }"; done; echo "]"'`;

      const result = await ssh.execCommand(command);
      if (!result.stdout) continue;

      const rawData = JSON.parse(result.stdout.trim());

      function convertToGB(sizeStr: string): number {
        const size = parseFloat(sizeStr);
        if (sizeStr.toUpperCase().endsWith('T')) return size * 1024;
        if (sizeStr.toUpperCase().endsWith('G')) return size;
        if (sizeStr.toUpperCase().endsWith('M')) return size / 1024;
        return 0;
      }

      allData.push(
        ...rawData.map((u: any) => ({
          username: u.username,
          used_storage_space_gb: convertToGB(u.used),
          total_files: u.files,
          mount_point: dir,
        }))
      );
    }

    return allData;

  } catch (err) {
    console.error(`[cluster-state] ❌ Failed to poll User Storage from ${node.name}: ${(err as Error).message}`);
    return [];
  } finally {
    ssh.dispose();
  }
}

/**
 * The main API Handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  console.log(`\n\n--- [cluster-state handler] Received request @ ${new Date().toISOString()} ---`);

  let password = ""; // <-- direct password
  let nodesConfig;

  try {
    // Read ./config/nodes.yaml
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };

  } catch (e) {
    return res.status(500).json({ error: 'Failed to load config.', details: (e as Error).message });
  }

  const { volume } = req.query as { volume?: string };
  const targetDir =
    volume === 'home' ? '/home'
    : volume === 'windows' ? '/windows-home'
    : '/scratch';

  if (targetDir === '/home' || targetDir === '/windows-home') {
    return res.status(403).json({
      error: `You don't have permission to access ${targetDir}`
    });
  }

  const headNode = nodesConfig.nodes[0];

  const [slurmData, storageData, userStorageData] = await Promise.all([
    pollSlurmData(headNode, password),
    pollStorageData(headNode, password),
    pollUserStorageData(headNode, password, '/scratch'),
  ]);

  const clusterState = {
    last_updated_timestamp: new Date().toISOString(),
    storage: storageData.length ? storageData : [
      { mount_point: "CEPH:/home (Fallback)", used_tib: 0, total_tib: 0, usage_percent: 0 }
    ],
    slurm_queue_info: slurmData.length ? slurmData : [
      { partition: 'cpu (Fallback)', cpu_free: 0, cpu_allocated: 0, mem_free_gb: 0, mem_allocated_gb: 0, gpu_free: null, gpu_allocated: null, interactive_jobs_running: 0, interactive_jobs_pending: 0, batch_jobs_running: 0, batch_jobs_pending: 0 }
    ],
    user_storage: userStorageData.map((u) => ({
      username: u.username,
      used_storage_space_gb: u.used_storage_space_gb,
      total_files: u.total_files,
      mount_point: u.mount_point,
    })),
  };

  res.status(200).json(clusterState);
}
