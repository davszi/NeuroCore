import React, { createContext, useContext, ReactNode } from 'react';
import useSWR from 'swr';
import { 
  ClusterState, 
  Job, 
  UserStorage, 
  // We import these to ensure types align, even if not explicitly used in props here
  GpuNode, 
  LoginNode, 
  StorageVolume, 
  SlurmPartition 
} from '@/types/cluster';

// --- Configuration ---
const POLLING_INTERVAL = 10000; // Poll RAM cache every 10s

// --- Fallback Data ---
const EMPTY_STATE: ClusterState = {
  last_updated_timestamp: new Date().toISOString(),
  total_power_consumption_watts: 0,
  login_nodes: [],
  gpu_nodes: [],
  storage: [],
  slurm_queue_info: [],
};

// --- Mock Data for Initial Load Safety ---
const FALLBACK_JOBS: Job[] = [];
const MOCK_USER_STORAGE: UserStorage[] = [];

interface ClusterContextType {
  clusterState: ClusterState;
  nodesState: ClusterState;
  jobs: Job[];
  userStorage: UserStorage[];
  getJobById: (id: string) => Job | undefined;
  isLoading: boolean;
  isJobsLoading: boolean;
  isNodesLoading: boolean;
  isStateLoading: boolean;
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
  
  // 1. Fetch Preview (History from Disk) - Runs ONCE on load
  const { data: previewData } = useSWR<ClusterState>('/api/preview', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });

  // 2. Fetch Realtime (RAM from Server) - Polls every 10s
  const { 
    data: liveState, 
    error: stateError,
    isLoading: isStateLoading 
  } = useSWR<ClusterState>('/api/node-state', fetcher, {
    refreshInterval: POLLING_INTERVAL,
  });

  const { 
    data: liveJobs, 
    error: jobsError,
    isLoading: isJobsLoading
  } = useSWR<Job[]>('/api/jobs', fetcher, {
    refreshInterval: POLLING_INTERVAL,
  });

  // 3. Smart Merge: Use Live if available, otherwise Preview, otherwise Empty
  const activeState = liveState || previewData || EMPTY_STATE;
  const activeJobs = liveJobs || FALLBACK_JOBS;
  const userStorage = activeState.user_storage || MOCK_USER_STORAGE;

  const getJobById = (id: string) => activeJobs.find(j => String(j.pid) === id || j.session === id);

  const value = {
    clusterState: activeState, // Shared structure
    nodesState: activeState,   // Shared structure
    jobs: activeJobs,
    userStorage,
    getJobById,
    
    // Loading states
    isLoading: (!liveState && !previewData),
    isStateLoading,
    isJobsLoading,
    isNodesLoading: isStateLoading, // They come from the same API source in this architecture

    // Errors
    stateError,
    jobsError,
    nodesError: stateError
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