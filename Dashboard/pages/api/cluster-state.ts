import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fetchUserStorage } from '@/lib/fetchers';
import { NodeConfig, UserStorage } from '@/types/cluster';

// --- SERVER-SIDE CACHE FOR STORAGE ---
let storageCache: {
  data: UserStorage[]; // FIXED: Typed correctly (was any[])
  timestamp: number;
} = {
  data: [],
  timestamp: 0
};

const STORAGE_CACHE_DURATION = 10 * 60 * 1000; // 10 Minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { volume } = req.query;

  const cachedGlobal = globalThis.CLUSTER_CACHE?.clusterState;
  
  if (!volume) {
    if (cachedGlobal) return res.status(200).json(cachedGlobal);
    return res.status(503).json({ error: "Initializing..." });
  }

  if (volume) {
    let targetDir = '/scratch';
    if (typeof volume === 'string' && volume.startsWith('/')) targetDir = volume;
    
    if (volume === 'home' || volume === '/home') {
        return res.status(403).json({ error: "Restricted" });
    }

    const now = Date.now();
    if (storageCache.data.length > 0 && (now - storageCache.timestamp < STORAGE_CACHE_DURATION)) {
      console.log(`[API] Serving ${targetDir} from RAM cache.`);
      return res.status(200).json({ user_storage: storageCache.data });
    }

    console.log(`[API] Cache expired or empty. Scanning ${targetDir}...`);

    try {
      const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
      const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
      const headNode = nodesConfig.nodes[0];

      const userStorage = await fetchUserStorage(headNode, targetDir);
      
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