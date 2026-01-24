import path from 'path';
import fs from 'fs';
import { ClusterState, Job, GpuNode, LoginNode, NodeConfig, Gpu } from '@/types/cluster';
import { fetchNodeHardware, fetchJobsFromNode, fetchClusterStats } from './fetchers';
import { createConnection } from './ssh';
import { NodeSSH } from 'node-ssh';
import { CLUSTER_NODES, GPU_INVENTORY } from './config';
import { syncNodeBenchmarks } from './ml-sync';

// 15 * 60 * 1000 for production)
const STALE_TIMEOUT_MS = 15 * 60 * 1000; 

// 1. Initialize Global Cache
globalThis.CLUSTER_CACHE = globalThis.CLUSTER_CACHE || {
  nodeState: null,
  clusterState: null,
  jobs: [],
  lastUpdated: 0,
  isReady: false
};

globalThis.isBenchmarkRunning = false;

declare global {
  var CLUSTER_CACHE: {
    nodeState: ClusterState | null;
    clusterState: ClusterState | null;
    jobs: Job[];
    lastUpdated: number;
    isReady: boolean;
  };
  var isBenchmarkRunning: boolean;
}

let isRunning = false;
let syncCounter = 0;
const SYNC_INTERVAL_CYCLES = 6;

// 2. Helper: Create "Ghost" Node for Offline Status
function getMockNode(node: NodeConfig) {
  const base = {
    node_name: node.name,
    cores_total: 0,
    mem_total_gb: 0,
    cpu_util_percent: 0,
    mem_util_percent: 0,
    active_users: 0,
    active_usernames: [],
    is_reachable: false,
    last_contact: 0 
  };

  if (node.hasGpu) {
    return { ...base, gpu_summary_name: "Unknown", gpus: [] } as GpuNode;
  }
  return base as LoginNode;
}

// 3. Helper: Load History on Startup
function loadLastSnapshot() {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    if (!fs.existsSync(snapshotDir)) return;

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));
    if (files.length === 0) return;

    files.sort();
    const latestFile = files[files.length - 1];
    const content = fs.readFileSync(path.join(snapshotDir, latestFile), 'utf-8');
    const data = JSON.parse(content);

    globalThis.CLUSTER_CACHE.nodeState = data;
    globalThis.CLUSTER_CACHE.clusterState = data;
    globalThis.CLUSTER_CACHE.isReady = true;
    
    console.log(`[Worker] ⚡ Hydrated cache from snapshot: ${latestFile}`);
  } catch (e) {
    console.error("[Worker] Failed to load snapshot:", e);
  }
}

// 4. Main Service Starter
export function startBackgroundServices() {
  if (isRunning) return;
  isRunning = true;
  console.log("🚀 [Worker] Background Monitoring Services Started");

  loadLastSnapshot();
  
  poll();
  setInterval(poll, 30 * 1000); 
  setInterval(saveHistory, 5 * 60 * 1000);
}

// 5. The Polling Logic
async function poll() {
  if (globalThis.isBenchmarkRunning) {
    if (Math.random() < 0.1) console.log('[Worker] ⏸️ Polling paused due to active benchmark...');
    return;
  }
  console.log(`[Worker] 🔄 Polling ${CLUSTER_NODES.length} nodes...`);

  try {
    const gpuNodes: GpuNode[] = [];
    const loginNodes: LoginNode[] = [];
    let allJobs: Job[] = [];
    let totalPower = 0;

    // --- SEQUENTIAL LOOP ---
    for (const node of CLUSTER_NODES) {
      if (globalThis.isBenchmarkRunning) break;

      let ssh: NodeSSH | null = null;
      let nodeData: GpuNode | LoginNode | null = null;
      let isReachable = false;
      const now = Date.now();
      const safeNode = node as unknown as NodeConfig;

      try {
        ssh = await createConnection(safeNode, { readyTimeout: 10000 });
        const result = await fetchNodeHardware(safeNode, GPU_INVENTORY, ssh);
        
        // 1. HARDWARE FETCH SUCCESS (Node is Online)
        if (result) {
          nodeData = result.data;
          isReachable = true;          
          (nodeData as any).last_contact = now; 
        }

        const jobs = await fetchJobsFromNode(safeNode, ssh);
        allJobs.push(...jobs);

      } catch (err) {
        
        if (!nodeData) {
            // 1. Find cached version
            const cachedState = globalThis.CLUSTER_CACHE.nodeState;
            let cachedNode: any = null;
            if (cachedState) {
              if (node.hasGpu) {
                 cachedNode = cachedState.gpu_nodes.find(n => n.node_name === node.name);
              } else {
                 cachedNode = cachedState.login_nodes.find(n => n.node_name === node.name);
              }
            }

            // 2. Check if cached version is fresh enough
            if (cachedNode && cachedNode.last_contact) {
                const timeSince = now - cachedNode.last_contact;
                
                if (timeSince < STALE_TIMEOUT_MS) {
                    nodeData = cachedNode;
                    isReachable = true; 
                } else {
                    // STALE CACHE: Show Offline
                    nodeData = cachedNode;
                    isReachable = false;
                    console.log(`[Worker] 🔴 Node ${node.name} stale (${Math.round(timeSince/1000)}s) -> Offline`);
                }
            } else {
                // NO CACHE: Offline
                nodeData = getMockNode(safeNode);
                isReachable = false;
            }
        }
      } finally {
        if (ssh) ssh.dispose();
      }

      if (nodeData) {
        (nodeData as any).is_reachable = isReachable;

        if (node.hasGpu && 'gpus' in nodeData) {
           const gpuNode = nodeData as GpuNode;
           gpuNodes.push(gpuNode);
           if (gpuNode.gpus) gpuNode.gpus.forEach((g: Gpu) => totalPower += (g.power_draw_watts || 0));
        } else {
           loginNodes.push(nodeData as LoginNode);
        }
      }
    }

    // --- FETCH CLUSTER STATS ---
    let storageVolumes: any[] = [];
    let slurmQueue: any[] = [];

    if (CLUSTER_NODES.length > 0) {
      let ssh: NodeSSH | null = null;
      try {
        const headNode = CLUSTER_NODES[0] as unknown as NodeConfig;
        ssh = await createConnection(headNode, { readyTimeout: 10000 });
        const clusterStats = await fetchClusterStats(headNode, ssh);
        
        if (clusterStats) {
          storageVolumes = clusterStats.volumes;
          slurmQueue = clusterStats.partitions;
        }
      } catch (err) {
        console.error(`[Worker] Failed to fetch cluster stats:`, err);
      } finally {
        if (ssh) ssh.dispose();
      }
    }

    // --- UPDATE GLOBAL STATE ---
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

    // --- BENCHMARK SYNC ---
    syncCounter++;
    if (syncCounter >= SYNC_INTERVAL_CYCLES) {
        syncCounter = 0;
        console.log(`[Worker] 🔄 Starting Background Benchmark Sync...`);
        Promise.all(
            gpuNodes.map(node => syncNodeBenchmarks(node.node_name))
        ).then(() => {
            console.log(`[Worker] ✅ Benchmark Sync Finished`);
        }).catch(err => {
            console.error(`[Worker] Benchmark Sync Error:`, err);
        });
    }

    console.log(`[Worker] ✅ Update Complete. GPUs: ${gpuNodes.length}`);

  } catch (e) {
    console.error("[Worker] Critical Poll Error:", e);
  }
}

// 6. Save History Logic
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