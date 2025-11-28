import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import useSWR from 'swr';
import { 
  ClusterState, 
  Job, 
  UserStorage, 
  GpuNode, 
  LoginNode, 
  StorageVolume, 
  SlurmPartition 
} from '@/types/cluster';

// --- Configuration ---
const REFRESH_INTERVAL_MS = 5000;      
const HISTORY_SAVE_INTERVAL_MS = 5 * 60 * 1000; 

// --- 1. Great Mock Data (Realistic Fallback) ---
const FALLBACK_CLUSTER_STATE: ClusterState = {
  last_updated_timestamp: new Date().toISOString(),
  total_power_consumption_watts: 450,
  login_nodes: [
    { 
      node_name: 'login-01 (Preview)', 
      cores_total: 64, 
      mem_total_gb: 256, 
      cpu_util_percent: 12, 
      mem_util_percent: 45, 
      active_users: 3, 
      active_usernames: ['alice', 'bob', 'charlie']
    },
  ],
  storage: [
    { mount_point: '/scratch', usage_percent: 75, used_tib: 15.5, total_tib: 20 },
    { mount_point: 'CEPH:/home', usage_percent: 42, used_tib: 4.2, total_tib: 10 },
  ],
  slurm_queue_info: [
    { 
      partition: 'gpu-h100', 
      cpu_free: 10, 
      cpu_allocated: 54, 
      gpu_free: 2, 
      gpu_allocated: 6, 
      mem_free_gb: 120, 
      mem_allocated_gb: 400, 
      interactive_jobs_running: 2, 
      interactive_jobs_pending: 1, 
      batch_jobs_running: 4, 
      batch_jobs_pending: 0 
    }
  ],
  gpu_nodes: [
    {
      node_name: 'gpu-node-01 (Preview)',
      cores_total: 128,
      mem_total_gb: 512,
      cpu_util_percent: 88,
      mem_util_percent: 60,
      gpu_summary_name: 'NVIDIA H100',
      active_users: 1,
      active_usernames: ['dave'],
      gpus: [
        { gpu_id: 0, gpu_name: 'H100', utilization_percent: 98, memory_used_mib: 78000, memory_total_mib: 80000, temperature_celsius: 72, power_draw_watts: 350, power_limit_watts: 700 },
        { gpu_id: 1, gpu_name: 'H100', utilization_percent: 0, memory_used_mib: 400, memory_total_mib: 80000, temperature_celsius: 32, power_draw_watts: 50, power_limit_watts: 700 },
      ]
    }
  ],
  user_storage: [
    { username: 'alice', used_storage_space_gb: 120.5, total_files: 5400, mount_point: '/scratch' },
    { username: 'bob', used_storage_space_gb: 850.2, total_files: 12000, mount_point: '/scratch' },
  ]
};

const FALLBACK_JOBS: Job[] = [
  { node: 'gpu-node-01', user: 'dave', pid: 101, process_name: 'python train_llm.py', gpu_memory_usage_mib: 78000 },
  { node: 'login-01', user: 'alice', pid: 204, process_name: 'vscode-server', gpu_memory_usage_mib: 0, cpu_percent: 15.5 },
];

const MOCK_USER_STORAGE: UserStorage[] = FALLBACK_CLUSTER_STATE.user_storage!;


// --- 2. Context Definition ---
interface ClusterContextType {
  clusterState: ClusterState;
  nodesState: ClusterState;
  jobs: Job[];
  userStorage: UserStorage[];
  getJobById: (sessionId: string) => Job | undefined;
  isStateLoading: boolean;
  isJobsLoading: boolean;
  isNodesLoading: boolean;
  stateError: any;
  jobsError: any;
  nodesError: any;
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Network response was not ok');
  return res.json();
});

export const ClusterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  
  // --- A. Real-Time Data Polling ---
  const {
    data: realClusterState,
    error: stateError,
    isLoading: isStateLoading,
  } = useSWR<ClusterState>('/api/cluster-state', fetcher, {
    refreshInterval: REFRESH_INTERVAL_MS,
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  const {
    data: realJobs,
    error: jobsError,
    isLoading: isJobsLoading,
  } = useSWR<Job[]>('/api/jobs', fetcher, {
    refreshInterval: REFRESH_INTERVAL_MS,
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  const {
    data: realNodes,
    error: nodesError,
    isLoading: isNodesLoading,
  } = useSWR<ClusterState>('/api/node-state', fetcher, {
    refreshInterval: REFRESH_INTERVAL_MS,
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  // --- B. Background History Saver (Every 5 Minutes) ---
  useEffect(() => {
    const saveHistory = async () => {
      try {
        console.log(`[Auto-Save] Triggering history save at ${new Date().toISOString()}...`);
        await fetch('/api/node-state?save=true'); 
      } catch (err) {
        console.error("[Auto-Save] Failed to trigger save:", err);
      }
    };
    const intervalId = setInterval(saveHistory, HISTORY_SAVE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  // --- C. Data merging with Great Mock Data ---
  // If data is loading or missing, we show the rich Fallback data
  const clusterState = realClusterState || FALLBACK_CLUSTER_STATE;
  const nodesState = realNodes || FALLBACK_CLUSTER_STATE;
  const jobs = realJobs || FALLBACK_JOBS;
  const userStorage = realClusterState?.user_storage || MOCK_USER_STORAGE;

  const getJobById = (pidOrId: string): Job | undefined => {
    return jobs.find((job) => String(job.pid) === pidOrId || job.session === pidOrId);
  };

  const value = {
    clusterState,
    nodesState,
    jobs,
    userStorage,
    getJobById,
    isStateLoading,
    isJobsLoading,
    isNodesLoading,
    stateError,
    jobsError,
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