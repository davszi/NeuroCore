import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';

// --- 1. Interfaces
interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_util_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius: number;
  power_watts: number;
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
}

interface LoginNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  active_users: number;
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

interface ClusterState {
  last_updated_timestamp: string;
  total_power_consumption_watts: number;
  login_nodes: LoginNode[];
  storage: StorageVolume[];
  slurm_queue_info: SlurmPartition[];
  gpu_nodes: GpuNode[];
}

interface UserStorage {
  username: string;
  used_storage_space_gb: number;
  total_files: number;
}

interface Job {
  job_id: string;
  session_name: string;
  owner: string;
  project: string;
  mode: string;
  node: string;
  status: 'Running' | 'Pending' | 'Completed';
  uptime: string;
  logs: string[];
}

// --- 2. Mock Data
const INITIAL_MOCK_STATE: ClusterState = {
  last_updated_timestamp: '2025-10-17T11:20:27Z',
  total_power_consumption_watts: 10814,
  login_nodes: [
    { node_name: 'dws-login-01', cores_total: 32, mem_total_gb: 110, cpu_util_percent: 15, mem_util_percent: 23, active_users: 25 },
    { node_name: 'dws-login-02', cores_total: 32, mem_total_gb: 110, cpu_util_percent: 0, mem_util_percent: 20, active_users: 11 },
  ],
  storage: [
    { mount_point: 'CEPH:/home', usage_percent: 88.56, used_tib: 5.37, total_tib: 6.0 },
    { mount_point: 'CEPH:/work', usage_percent: 43.34, used_tib: 17.34, total_tib: 40.0 },
    { mount_point: 'CEPH:/ceph', usage_percent: 88.21, used_tib: 323.88, total_tib: 367.14 },
  ],
  slurm_queue_info: [
    { partition: 'cpu', cpu_free: 142, cpu_allocated: 340, gpu_free: null, gpu_allocated: null, mem_free_gb: 10549, mem_allocated_gb: 1990, interactive_jobs_running: 3, interactive_jobs_pending: 0, batch_jobs_running: 9, batch_jobs_pending: 0 },
    { partition: 'gpu-vram-12gb', cpu_free: 88, cpu_allocated: 64, gpu_free: 8, gpu_allocated: 2, mem_free_gb: 1378, mem_allocated_gb: 214, interactive_jobs_running: 2, interactive_jobs_pending: 0, batch_jobs_running: 0, batch_jobs_pending: 0 },
    { partition: 'gpu-vram-48gb', cpu_free: 278, cpu_allocated: 314, gpu_free: 15, gpu_allocated: 25, mem_free_gb: 4487, mem_allocated_gb: 1118, interactive_jobs_running: 2, interactive_jobs_pending: 0, batch_jobs_running: 15, batch_jobs_pending: 0 },
  ],
  gpu_nodes: [
    { node_name: 'dws-09', cores_total: 40, mem_total_gb: 768, cpu_util_percent: 3, mem_util_percent: 1, gpu_summary_name: '2x RTX 6000', gpus: [
        { gpu_id: 0, gpu_name: 'RTX 6000', utilization_percent: 0, memory_util_percent: 20, memory_used_mib: 9590, memory_total_mib: 47952, temperature_celsius: 45, power_watts: 80, power_limit_watts: 300 },
        { gpu_id: 1, gpu_name: 'RTX 6000', utilization_percent: 89, memory_util_percent: 33, memory_used_mib: 15824, memory_total_mib: 47952, temperature_celsius: 78, power_watts: 240, power_limit_watts: 300 },
      ],
    },
    { node_name: 'dws-12', cores_total: 192, mem_total_gb: 1536, cpu_util_percent: 5, mem_util_percent: 52, gpu_summary_name: '4x H100 NVL', gpus: [
        { gpu_id: 0, gpu_name: 'H100 NVL', utilization_percent: 98, memory_util_percent: 92, memory_used_mib: 86847, memory_total_mib: 94400, temperature_celsius: 85, power_watts: 310, power_limit_watts: 350 },
        { gpu_id: 1, gpu_name: 'H100 NVL', utilization_percent: 4, memory_util_percent: 41, memory_used_mib: 38704, memory_total_mib: 94400, temperature_celsius: 62, power_watts: 150, power_limit_watts: 350 },
        { gpu_id: 2, gpu_name: 'H100 NVL', utilization_percent: 98, memory_util_percent: 58, memory_used_mib: 54752, memory_total_mib: 94400, temperature_celsius: 84, power_watts: 305, power_limit_watts: 350 },
        { gpu_id: 3, gpu_name: 'H100 NVL', utilization_percent: 20, memory_util_percent: 98, memory_used_mib: 92512, memory_total_mib: 94400, temperature_celsius: 71, power_watts: 220, power_limit_watts: 350 },
      ],
    },
  ],
};

const MOCK_USER_STORAGE: UserStorage[] = [
  { username: 'aansari', used_storage_space_gb: 72.05, total_files: 71135 },
  { username: 'aasteine', used_storage_space_gb: 954.32, total_files: 225496 },
  { username: 'abthomas', used_storage_space_gb: 0.0, total_files: 1 },
];

const MOCK_JOBS: Job[] = [
  { job_id: 'job-12345', session_name: 'train:aansari:llm-v2:lora', owner: 'aansari', project: 'llm-v2', mode: 'lora', node: 'dws-09', status: 'Running', uptime: '4h 2m 5s', logs: ['Epoch 1/5, Step 300/500, Loss: 1.050', 'Epoch 1/5, Step 200/500, Loss: 1.102'],
  },
  { job_id: 'job-12346', session_name: 'train:abthomas:img-gen:full-ft', owner: 'abthomas', project: 'img-gen', mode: 'full-ft', node: 'dws-12', status: 'Running', uptime: '24h 5m 0s', logs: ['Batch 2500/10000, Avg Loss: 0.45', 'Batch 2000/10000, Avg Loss: 0.51'],
  },
  { job_id: 'job-12347', session_name: 'train:aasteine:data-prep:pre-processing', owner: 'aasteine', project: 'data-prep', mode: 'pre-processing', node: 'dws-login-01', status: 'Pending', uptime: '0s', logs: ['Waiting for resources...'],
  },
];

// --- 3. React Context Setup

// Define the shape of the context data
interface ClusterContextType {
  clusterState: ClusterState;
  userStorage: UserStorage[];
  jobs: Job[];
  getJobById: (id: string) => Job | undefined;
}

// Create the context
const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

// Helper function to get a random number for refreshing
const rand = (min: number, max: number) => {
  // Ensure min and max are integers for safety
  min = Math.floor(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Create the provider component
export const ClusterProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Use state to hold our mock data
  const [clusterState, setClusterState] =
    useState<ClusterState>(INITIAL_MOCK_STATE);
  
  // NOTE: We keep jobs and userStorage static for now.
  // Later, these would also be in state and refresh.
  const userStorage = MOCK_USER_STORAGE; // <-- CORRECTED TYPO
  const jobs = MOCK_JOBS;

  // useEffect to set up the auto-refresh interval
  useEffect(() => {
    // Set an interval to update the state every 5 seconds (5000 ms)
    const intervalId = setInterval(() => {
      // This is a "read-only" simulation, so we just update metrics
      setClusterState((currentState) => {
        // Create a deep copy of the state to avoid mutation
        // Using structuredClone for a more performant deep copy
        const newState = structuredClone(currentState);

        // Update timestamp
        newState.last_updated_timestamp = new Date().toISOString();
        
        // Update total power
        newState.total_power_consumption_watts = rand(10500, 11000);

        // Simulate new metrics for each GPU node
        newState.gpu_nodes.forEach((node) => {
          node.cpu_util_percent = rand(5, 15);
          node.mem_util_percent = rand(40, 60);

          node.gpus.forEach((gpu) => {
            // Only update "active" GPUs
            if (gpu.utilization_percent > 10 || gpu.utilization_percent < 0) {
              gpu.utilization_percent = rand(85, 100);
              // Fluctuate memory slightly
              let mem_fluc = rand(-2, 2);
              gpu.memory_util_percent = Math.max(0, Math.min(100, gpu.memory_util_percent + mem_fluc)); 
              gpu.temperature_celsius = rand(75, 85);
              gpu.power_watts = rand(300, 350);
            } else {
              // Make idle GPUs fluctuate a little
              gpu.utilization_percent = rand(0, 3);
              gpu.temperature_celsius = rand(35, 45);
              gpu.power_watts = rand(50, 80);
            }
          });
        });

        // Simulate login node changes
        newState.login_nodes.forEach(node => {
          node.cpu_util_percent = rand(0, 25);
          // Ensure active_users doesn't go below 0
          node.active_users = Math.max(0, rand(node.active_users - 1, node.active_users + 1));
        });

        return newState;
      });
    }, 5000); // 5000 ms = 5 seconds

    // Clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []);

  // Simple function to find a job by its ID
  const getJobById = (id: string): Job | undefined => {
    return jobs.find((job) => job.job_id === id);
  };

  const value = {
    clusterState, // This is now live state
    userStorage,
    jobs,
    getJobById,
  };

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
};

// Create a custom hook for easy access to the context
export const useCluster = () => {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
};