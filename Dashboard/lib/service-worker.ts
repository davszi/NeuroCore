import path from 'path';
import fs from 'fs';
import { ClusterState, Job, GpuNode, LoginNode, NodeConfig, Gpu } from '@/types/cluster';
// ADDED: fetchClusterStats
import { fetchNodeHardware, fetchJobsFromNode, fetchClusterStats } from './fetchers';
import { CLUSTER_NODES, GPU_INVENTORY } from './config';

globalThis.CLUSTER_CACHE = globalThis.CLUSTER_CACHE || {
  nodeState: null,
  clusterState: null,
  jobs: [],
  lastUpdated: 0,
  isReady: false
};

declare global {
  var CLUSTER_CACHE: {
    nodeState: ClusterState | null;
    clusterState: ClusterState | null;
    jobs: Job[];
    lastUpdated: number;
    isReady: boolean;
  };
}

let isRunning = false;

export function startBackgroundServices() {
  if (isRunning) return;
  isRunning = true;
  console.log("🚀 [Worker] Background Monitoring Services Started");

  poll();
  setInterval(poll, 4 * 30000); // 3.5 minutes poll interval

  setInterval(saveHistory, 5 * 60 * 1000);
}

async function poll() {
  console.log(`[Worker] 🔄 Polling ${CLUSTER_NODES.length} nodes...`);
  
  try {
    const gpuNodes: GpuNode[] = [];
    const loginNodes: LoginNode[] = [];
    let allJobs: Job[] = [];
    let totalPower = 0;

    // 1. Fetch Node Hardware & Jobs (Parallel)
    const nodePromises = CLUSTER_NODES.map(async (node) => {
      try {
        const safeNode = node as unknown as NodeConfig;
        
        const result = await fetchNodeHardware(safeNode, GPU_INVENTORY);
        if (!result) return;

        if (node.hasGpu && result.type === 'gpu') {
          const gpuData = result.data as GpuNode;
          if (gpuData.gpus && gpuData.gpus.length > 0) {
            gpuNodes.push(gpuData);
            gpuData.gpus.forEach((g: Gpu) => totalPower += g.power_draw_watts || 0);
          } else {
            loginNodes.push(result.data as unknown as LoginNode);
          }
        } else {
          loginNodes.push(result.data as unknown as LoginNode);
        }

        const jobs = await fetchJobsFromNode(safeNode);
        allJobs.push(...jobs);

      } catch (err) {
        console.error(`[Worker] Failed to poll ${node.name}:`, err);
      }
    });

    await Promise.all(nodePromises);

    let storageVolumes: any[] = [];
    let slurmQueue: any[] = [];

    if (CLUSTER_NODES.length > 0) {
      try {
        const headNode = CLUSTER_NODES[0] as unknown as NodeConfig;
        const clusterStats = await fetchClusterStats(headNode);
        
        if (clusterStats) {
          storageVolumes = clusterStats.volumes;
          slurmQueue = clusterStats.partitions;
          console.log(`[Worker] Fetched ${storageVolumes.length} volumes and ${slurmQueue.length} partitions.`);
        }
      } catch (err) {
        console.error(`[Worker] Failed to fetch cluster stats:`, err);
      }
    }

    const timestamp = new Date().toISOString();
    
    const nodeStatePayload: ClusterState = {
      last_updated_timestamp: timestamp,
      total_power_consumption_watts: Math.round(totalPower),
      login_nodes: loginNodes.sort((a, b) => a.node_name.localeCompare(b.node_name)),
      gpu_nodes: gpuNodes.sort((a, b) => a.node_name.localeCompare(b.node_name)),
      
      storage: storageVolumes, 
      slurm_queue_info: slurmQueue,
      
      user_storage: [] 
    };

    globalThis.CLUSTER_CACHE.nodeState = nodeStatePayload;
    globalThis.CLUSTER_CACHE.clusterState = nodeStatePayload; 
    globalThis.CLUSTER_CACHE.jobs = allJobs;
    globalThis.CLUSTER_CACHE.lastUpdated = Date.now();
    globalThis.CLUSTER_CACHE.isReady = true;

    console.log(`[Worker] ✅ Update Complete. GPUs: ${gpuNodes.length}, Storage: ${storageVolumes.length}`);

  } catch (e) {
    console.error("[Worker] Critical Poll Error:", e);
  }
}

const saveHistory = async () => {
  if (!globalThis.CLUSTER_CACHE.isReady || !globalThis.CLUSTER_CACHE.nodeState) return;
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
    
    const fileName = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.writeFileSync(path.join(snapshotDir, fileName), JSON.stringify(globalThis.CLUSTER_CACHE.nodeState));
    
    console.log(`[Worker] 💾 History Saved: ${fileName}`);
  } catch (e) { 
    console.error("[Worker] Save History Failed:", e); 
  }
};