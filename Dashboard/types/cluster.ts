// --- Node & Cluster Interfaces ---
export interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
  password?: string;
}

export interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_draw_watts: number;
  power_limit_watts: number;
  fan_speed_percent?: number;
}

export interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;
  gpus: Gpu[];
  active_users: number;
  active_usernames: string[];
}

export interface LoginNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  active_users: number;
  active_usernames: string[];
}

export interface StorageVolume {
  mount_point: string;
  usage_percent: number;
  used_tib: number;
  total_tib: number;
}

export interface UserStorage {
  username: string;
  used_storage_space_gb: number;
  total_files: number;
  mount_point?: string;
}

export interface SlurmPartition {
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

export interface ClusterState {
  last_updated_timestamp: string;
  total_power_consumption_watts: number;
  login_nodes: LoginNode[];
  gpu_nodes: GpuNode[];
  storage: StorageVolume[];
  slurm_queue_info: SlurmPartition[];
  user_storage?: UserStorage[];
}

export interface Job {
  node: string;
  user: string;
  pid: number;
  process_name: string;
  gpu_memory_usage_mib: number;
  cpu_percent?: number;
  session?: string;
  uptime?: string;
  log_preview?: string[];
}

// --- New Benchmark Interfaces ---
export interface MetricEntry {
  step: number;
  epoch?: number;
  loss?: number;
  perplexity?: number;
  ram_usage_GB?: number;
  gpu_mem_GB?: number;
  runtime_seconds?: number;
}

export interface AttentionMetricsResponse {
  sdpa: {
    data: MetricEntry[];
    runtimePerEpoch: { epoch: number; runtime_seconds: number }[];
  };
  flash: {
    data: MetricEntry[];
    runtimePerEpoch: { epoch: number; runtime_seconds: number }[];
  };
}