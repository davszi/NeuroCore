import React, { createContext, useContext, ReactNode } from 'react';
import useSWR from 'swr';


// and the props expected by 'GpuCard.tsx'
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

interface GpuNode {
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


interface LoginNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  active_users: number;
  active_usernames: string[];
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
export interface ClusterState {
  last_updated_timestamp: string;
  total_power_consumption_watts: number;
  login_nodes: LoginNode[];
  storage: StorageVolume[];
  slurm_queue_info: SlurmPartition[];
  gpu_nodes: GpuNode[]; 
  user_storage?: UserStorage[];
}
interface Job {
  cpu_percent: any;
  node: string;
  session: string;
  pid: number;
  uptime: string;
  log_preview: string[];
  user: string; 
  process_name: string; 
  gpu_memory_usage_mib: number; 
}
interface UserStorage {
  username: string;
  used_storage_space_gb: number;
  total_files: number;
  mount_point?: string; 
}


// --- 2. Fallback Mock Data ---
const FALLBACK_CLUSTER_STATE: ClusterState = {
  last_updated_timestamp: "2025-01-01T00:00:00Z",
  total_power_consumption_watts: 0,
  login_nodes: [
    { node_name: 'dws-login-01 (Mock)', cores_total: 32, mem_total_gb: 110, cpu_util_percent: 0, mem_util_percent: 0, active_users: 0 , active_usernames: []},
  ],
  storage: [
    { mount_point: 'CEPH:/home (Mock)', usage_percent: 0, used_tib: 0, total_tib: 0 },
  ],
  slurm_queue_info: [
    { partition: 'gpu-vram-48gb (Mock)', cpu_free: 0, cpu_allocated: 0, gpu_free: 0, gpu_allocated: 0, mem_free_gb: 0, mem_allocated_gb: 0, interactive_jobs_running: 0, interactive_jobs_pending: 0, batch_jobs_running: 0, batch_jobs_pending: 0 }
  ],
  gpu_nodes: [
    { 
      node_name: 'dws-00 (Mock)', 
      cores_total: 0, 
      mem_total_gb: 0, 
      cpu_util_percent: 0, 
      mem_util_percent: 0, 
      gpu_summary_name: 'Mock GPU', 
      gpus: [
        { 
          gpu_id: 0, 
          gpu_name: 'Mock H200', 
          utilization_percent: 0, 
          memory_used_mib: 0,    
          memory_total_mib: 0,
          temperature_celsius: 0, 
          power_draw_watts: 0,   
          power_limit_watts: 0 
        },
      ],
      active_users: 0,               
      active_usernames: [],              
    },
  ],
};
const FALLBACK_JOBS: Job[] = [
  { 
    node: 'mock-node', 
    session: 'train:mock:fallback:lora', 
    pid: 123, 
    uptime: '0s', 
    log_preview: ['Waiting for connection...'],
    user: 'mock-user', 
    process_name: '/scratch/mock-user/fallback/job.py', 
    gpu_memory_usage_mib: 0 
  }
];
const MOCK_USER_STORAGE: UserStorage[] = [
  { username: 'aansari', used_storage_space_gb: 72.05, total_files: 71135 },
  { username: 'aasteine', used_storage_space_gb: 954.32, total_files: 225496 },
  { username: 'abthomas', used_storage_space_gb: 0.0, total_files: 1 },
];


const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) {
    throw new Error('Network response was not ok');
  }
  return res.json();
});

interface ClusterContextType {
  clusterState: ClusterState;
  userStorage: UserStorage[];
  jobs: Job[];
  getJobById: (sessionId: string) => Job | undefined;
  isStateLoading: boolean;
  isJobsLoading: boolean;
  stateError: any;
  jobsError: any;

  nodesState: ClusterState;
  isNodesLoading: boolean;
  nodesError: any;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export const ClusterProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  
  const {
    data: realState,
    error: stateError,
    isLoading: isStateLoading,
  } = useSWR<ClusterState>('/api/cluster-state', fetcher, {
    refreshInterval: 5000, 
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const {
    data: realJobs,
    error: jobsError,
    isLoading: isJobsLoading,
  } = useSWR<Job[]>('/api/jobs', fetcher, {
    refreshInterval: 5000, 
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const {
    data: realNodes,
    error: nodesError,
    isLoading: isNodesLoading,
  } = useSWR<ClusterState>('/api/node-state', fetcher, {
    refreshInterval: 5000, 
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const clusterState = realState || FALLBACK_CLUSTER_STATE;
  const jobs = realJobs || FALLBACK_JOBS;
  const userStorage = MOCK_USER_STORAGE;
  const nodesState = realNodes || FALLBACK_CLUSTER_STATE;

  const getJobById = (sessionId: string): Job | undefined => {
    return jobs.find((job) => job.session === sessionId);
  };

  const value = {
    clusterState,
    userStorage,
    jobs,
    getJobById,
    isStateLoading,
    isJobsLoading,
    stateError,
    jobsError,

    // Nodes state
    nodesState,
    isNodesLoading,
    nodesError
  };

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  );
};

export const useCluster = () => {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
};