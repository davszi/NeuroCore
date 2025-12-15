import React, { createContext, useContext, ReactNode } from 'react';
import useSWR from 'swr';
import { 
  ClusterState, 
  Job, 
  UserStorage,
} from '@/types/cluster';

const POLLING_INTERVAL = 10000; 

const EMPTY_STATE: ClusterState = {
  last_updated_timestamp: new Date().toISOString(),
  total_power_consumption_watts: 0,
  login_nodes: [],
  gpu_nodes: [],
  storage: [],
  slurm_queue_info: [],
};

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
  
  const { data: previewData } = useSWR<ClusterState>('/api/preview', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });

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

  const activeState = liveState || previewData || EMPTY_STATE;
  const activeJobs = liveJobs || FALLBACK_JOBS;
  const userStorage = activeState.user_storage || MOCK_USER_STORAGE;

  const getJobById = (id: string) => activeJobs.find(j => String(j.pid) === id || j.session === id);

  const value = {
    clusterState: activeState,
    nodesState: activeState,  
    jobs: activeJobs,
    userStorage,
    getJobById,
    
    isLoading: (!liveState && !previewData),
    isStateLoading,
    isJobsLoading,
    isNodesLoading: isStateLoading,

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