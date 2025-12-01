import { runCommand } from './ssh';
import { NodeConfig, GpuNode, LoginNode, Job, Gpu, SlurmPartition, StorageVolume, UserStorage } from '@/types/cluster';

// --- A. Fetch Node Hardware ---
export async function fetchNodeHardware(node: NodeConfig, gpuInventory: any) {
  const DELIMITER = "---SECTION---";
  
  // 1. HARDWARE CMD: Added "|| true" to prevent Code 1 on CPU nodes
  const cmd = [
    `nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits || true`,
    `echo "${DELIMITER}"`,
    `nproc`,
    `echo "${DELIMITER}"`,
    `grep -E 'MemTotal|MemAvailable' /proc/meminfo`,
    `echo "${DELIMITER}"`,
    `who | wc -l`,
    `echo "${DELIMITER}"`,
    `who | awk '{print $1}' | sort | uniq`
  ].join(';');

  // Use 60s timeout from ssh.ts default
  const rawOutput = await runCommand(node, cmd);
  
  if (!rawOutput) return null;

  const sections = rawOutput.split(DELIMITER).map(s => s.trim());

  // Parse GPUs
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

  // Parse CPU/Mem/Users
  const cores_total = parseInt(sections[1] || '0');
  
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

  const active_users = parseInt(sections[3] || '0');
  const active_usernames = sections[4] ? sections[4].split('\n').filter(Boolean) : [];

  const staticData = gpuInventory.nodes[node.name] || gpuInventory.defaults;
  const finalCores = cores_total || staticData.cores_total;
  const finalMem = mem_total_gb || staticData.mem_total_gb;

  const baseNode = {
    node_name: node.name,
    cores_total: finalCores,
    mem_total_gb: finalMem,
    cpu_util_percent: 0, 
    mem_util_percent,
    active_users,
    active_usernames
  };

  if (gpus.length > 0) {
    return {
      type: 'gpu',
      data: { ...baseNode, gpu_summary_name: staticData.gpu_name, gpus } as GpuNode
    };
  } else {
    return {
      type: 'login',
      data: baseNode as LoginNode
    };
  }
}

// --- B. Fetch Jobs ---
export async function fetchJobsFromNode(node: NodeConfig): Promise<Job[]> {
  const records: Job[] = [];

  // Added || true
  const JOB_CMD_GPU = `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits || true`;
  const gpuOutput = await runCommand(node, JOB_CMD_GPU);

  if (gpuOutput) {
    gpuOutput.trim().split('\n').forEach((line) => {
      const parts = line.split(', ');
      if (parts.length < 3) return;
      const process_name = parts[1];
      let user = 'unknown';
      const pathParts = process_name.split('/');
      const scratchIndex = pathParts.indexOf('scratch');
      if (scratchIndex !== -1 && pathParts[scratchIndex + 1]) {
        user = pathParts[scratchIndex + 1];
      }
      records.push({
        node: node.name,
        user,
        pid: parseInt(parts[0]),
        process_name,
        gpu_memory_usage_mib: parseFloat(parts[2]),
      });
    });
  }

  const JOB_CMD_CPU = `ps -eo pid,user,%cpu,comm --sort=-%cpu | head -n 20`;
  const cpuOutput = await runCommand(node, JOB_CMD_CPU);

  if (cpuOutput) {
    cpuOutput.trim().split('\n').slice(1).forEach((line) => {
      const match = line.trim().split(/\s+/);
      if (match.length < 4) return;
      if (match[1] === 'root') return;
      if (parseFloat(match[2]) < 5.0) return;

      records.push({
        node: node.name,
        user: match[1],
        pid: parseInt(match[0]),
        process_name: `${match[3]} (CPU)`,
        gpu_memory_usage_mib: 0,
        cpu_percent: parseFloat(match[2])
      });
    });
  }

  return records;
}

// --- C. Fetch Cluster Stats ---
export async function fetchClusterStats(node: NodeConfig) {
  const SLURM_CMD = `sinfo -o "%.12P %.5C %.5a %.5I %.10m %.6G" --noheader || true`;
  const slurmOutput = await runCommand(node, SLURM_CMD);
  const partitions: SlurmPartition[] = [];

  if (slurmOutput && slurmOutput.trim()) {
    slurmOutput.trim().split('\n').forEach(line => {
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
         try { gpuAlloc = parseInt(parts[5].split(':').pop() || '0'); } catch {}
      }

      partitions.push({
        partition: parts[0],
        cpu_free: idleCpus,
        cpu_allocated: allocCpus,
        gpu_free: null,
        gpu_allocated: gpuAlloc,
        mem_free_gb: Math.round(memFree),
        mem_allocated_gb: Math.round(memAllocated),
        interactive_jobs_running: 0, interactive_jobs_pending: 0,
        batch_jobs_running: 0, batch_jobs_pending: 0,
      });
    });
  }

  const STORAGE_CMD = "df -hT | grep -E 'ceph|nfs|/scratch' || true";
  const storageOutput = await runCommand(node, STORAGE_CMD);
  const volumes: StorageVolume[] = [];

  const parseToTib = (str: string) => {
    const val = parseFloat(str);
    if (str.includes('T')) return val;
    if (str.includes('G')) return val / 1024;
    return 0;
  };

  if (storageOutput && storageOutput.trim()) {
    storageOutput.trim().split('\n').forEach(line => {
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

  return { partitions, volumes };
}

// --- D. Fetch User Storage (RESTORED LEGACY COMMAND) ---
export async function fetchUserStorage(node: NodeConfig, targetDir: string): Promise<UserStorage[]> {
  console.log(`[Storage] Fetching ${targetDir}...`);

  // We revert to the command that worked for you before.
  // Using 'bash -c' ensures loops and wildcards work correctly.
  // We construct JSON directly on the server.
  const CMD = `bash -c 'echo "["; first=1; for dir in ${targetDir}/*; do [ -d "$dir" ] || continue; user=$(basename "$dir"); used=$(du -sk "$dir" 2>/dev/null | awk "{print \\$1}"); [ -z "$used" ] && used=0; file_count=$(find "$dir" -maxdepth 3 -type f 2>/dev/null | wc -l); [ $first -eq 0 ] && echo ","; first=0; echo "{ \\"username\\": \\"$user\\", \\"used_kb\\": $used, \\"files\\": $file_count }"; done; echo "]"'`;

  try {
    // 60s Timeout (via default)
    const output = await runCommand(node, CMD);
    
    if (!output || !output.trim()) {
      console.warn(`[Storage] No output from ${targetDir}`);
      return [];
    }

    // Locate the JSON part in case of banner text
    const startIndex = output.indexOf('[');
    const endIndex = output.lastIndexOf(']');
    
    if (startIndex === -1 || endIndex === -1) {
      console.warn(`[Storage] Invalid JSON format`);
      return [];
    }

    const jsonStr = output.substring(startIndex, endIndex + 1);
    const rawData = JSON.parse(jsonStr);

    // Map to our interface
    const users: UserStorage[] = rawData.map((u: any) => ({
      username: u.username,
      // Convert KB to GB
      used_storage_space_gb: Math.round((parseInt(u.used_kb || 0) / 1024 / 1024) * 100) / 100,
      total_files: parseInt(u.files || 0)
    }));

    return users.sort((a, b) => b.used_storage_space_gb - a.used_storage_space_gb);

  } catch (e) {
    console.error(`[Storage] Error parsing:`, e);
    return [];
  }
}