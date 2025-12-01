import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeConfig, ClusterState, Job, GpuNode, LoginNode } from '@/types/cluster';
import { fetchNodeHardware, fetchJobsFromNode, fetchClusterStats } from './fetchers';

// --- 1. Define Global Cache ---
// This ensures data survives between API calls
globalThis.CLUSTER_CACHE = {
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

// --- 2. Main Logic ---
export function startBackgroundServices() {
  if (isRunning) return;
  isRunning = true;
  console.log("🚀 [Worker] Background Monitoring Services Started");

  // Load Config
  let nodesConfig: { nodes: NodeConfig[] };
  let gpuInventory: any;

  try {
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    const invPath = path.join(process.cwd(), '../config/gpu_inventory.yaml');
    
    if (fs.existsSync(nodesPath) && fs.existsSync(invPath)) {
      nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
      gpuInventory = yaml.load(fs.readFileSync(invPath, 'utf8'));
    } else {
      console.error("❌ [Worker] Config files missing. Worker stopped.");
      return;
    }
  } catch (e) {
    console.error("❌ [Worker] Config Load Error:", e);
    return;
  }

  const headNode = nodesConfig.nodes[0];

  // --- LOOP A: Real-Time Data (Every 30s) ---
  const updateRealTime = async () => {
    try {
      // 1. Fetch Hardware (Parallel)
      const nodePromises = nodesConfig.nodes.map(node => fetchNodeHardware(node, gpuInventory));
      const nodeResults = await Promise.all(nodePromises);

      const gpuNodes: GpuNode[] = [];
      const loginNodes: LoginNode[] = [];
      let totalPower = 0;

      nodeResults.forEach(res => {
        if (!res) return;
        if (res.type === 'gpu') {
          gpuNodes.push(res.data as GpuNode);
          (res.data as GpuNode).gpus.forEach(g => totalPower += g.power_draw_watts);
        } else {
          loginNodes.push(res.data as LoginNode);
        }
      });

      // 2. Fetch Jobs (Parallel)
      const jobPromises = nodesConfig.nodes.map(node => fetchJobsFromNode(node));
      const jobResults = await Promise.all(jobPromises);
      const allJobs = jobResults.flat().sort((a, b) => b.gpu_memory_usage_mib - a.gpu_memory_usage_mib);

      // 3. Fetch Cluster Stats (Head Node Only)
      const { partitions, volumes } = await fetchClusterStats(headNode);

      // 4. Update RAM Cache
      const timestamp = new Date().toISOString();
      
      const nodeStatePayload: ClusterState = {
        last_updated_timestamp: timestamp,
        total_power_consumption_watts: Math.round(totalPower),
        login_nodes: loginNodes,
        gpu_nodes: gpuNodes,
        storage: volumes,
        slurm_queue_info: partitions,
        user_storage: [] // Empty by default (fetched on-demand via API)
      };

      globalThis.CLUSTER_CACHE.nodeState = nodeStatePayload;
      globalThis.CLUSTER_CACHE.clusterState = nodeStatePayload; 
      globalThis.CLUSTER_CACHE.jobs = allJobs;
      globalThis.CLUSTER_CACHE.lastUpdated = Date.now();
      globalThis.CLUSTER_CACHE.isReady = true;

    } catch (e) {
      console.error("[Worker] Fetch Error:", e);
    }
  };

  // --- LOOP B: History Saver (Every 5 Minutes) ---
  const saveHistory = async () => {
    if (!globalThis.CLUSTER_CACHE.isReady || !globalThis.CLUSTER_CACHE.nodeState) return;
    
    try {
      const snapshotDir = path.join(process.cwd(), "data/node-history");
      if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

      const fileName = `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      fs.writeFileSync(path.join(snapshotDir, fileName), JSON.stringify(globalThis.CLUSTER_CACHE.nodeState));
      
      console.log(`[Worker] 💾 History Saved: ${fileName}`);
    } catch (e) {
      console.error("[Worker] Save History Error:", e);
    }
  };

  // --- Start Loops ---
  updateRealTime(); // Run immediately
  setInterval(updateRealTime, 30000); // 30 Seconds Interval
  setInterval(saveHistory, 5 * 60 * 1000); // 5 Minutes Interval
}