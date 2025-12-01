import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fetchUserStorage } from '@/lib/fetchers';
import { NodeConfig } from '@/types/cluster';

// --- SERVER-SIDE CACHE FOR STORAGE ---
// We keep this outside the function so it persists in memory
// This prevents re-scanning /scratch if 10 users click it at once
let storageCache: {
  data: any[];
  timestamp: number;
} = {
  data: [],
  timestamp: 0
};

const STORAGE_CACHE_DURATION = 10 * 60 * 1000; // 10 Minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { volume } = req.query;

  // 1. Return cached metadata (Slurm/Volumes) instantly from the Worker
  // (This part is always instant because the Background Worker handles it)
  const cachedGlobal = globalThis.CLUSTER_CACHE?.clusterState;
  
  if (!volume) {
    if (cachedGlobal) return res.status(200).json(cachedGlobal);
    return res.status(503).json({ error: "Initializing..." });
  }

  // 2. Handle specific volume request (User Storage)
  if (volume) {
    let targetDir = '/scratch';
    if (typeof volume === 'string' && volume.startsWith('/')) targetDir = volume;
    
    // Security check
    if (volume === 'home' || volume === '/home') {
        return res.status(403).json({ error: "Restricted" });
    }

    // --- CACHE CHECK ---
    const now = Date.now();
    // If we have data and it is less than 10 minutes old, return it instantly.
    if (storageCache.data.length > 0 && (now - storageCache.timestamp < STORAGE_CACHE_DURATION)) {
      console.log(`[API] Serving ${targetDir} from RAM cache.`);
      return res.status(200).json({ user_storage: storageCache.data });
    }

    console.log(`[API] Cache expired or empty. Scanning ${targetDir}...`);

    try {
      // Load config to find Head Node
      const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
      const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
      const headNode = nodesConfig.nodes[0];

      // Fetch live (This takes 10-20s)
      const userStorage = await fetchUserStorage(headNode, targetDir);
      
      // Save to Cache if we got results
      if (userStorage.length > 0) {
        storageCache = {
          data: userStorage,
          timestamp: Date.now()
        };
      }

      return res.status(200).json({
        user_storage: userStorage
      });

    } catch (e) {
      console.error("[API] Storage Fetch Error:", e);
      return res.status(500).json({ error: "Failed to fetch user storage" });
    }
  }
}