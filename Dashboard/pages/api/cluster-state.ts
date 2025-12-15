import { NextApiRequest, NextApiResponse } from 'next';
import { fetchUserStorage } from '@/lib/fetchers';
import { UserStorage, NodeConfig } from '@/types/cluster';
import { CLUSTER_NODES } from '@/lib/config';

const cacheMap = new Map<string, { data: UserStorage[]; timestamp: number }>();
const STORAGE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { volume } = req.query;
  const cachedGlobal = globalThis.CLUSTER_CACHE?.clusterState;
  
  if (!volume) {
    if (cachedGlobal) return res.status(200).json(cachedGlobal);
    return res.status(503).json({ error: "Initializing..." });
  }

  if (typeof volume === 'string') {
    let targetDir = '/scratch';
    if (volume.startsWith('/')) targetDir = volume;
    
    if (volume === 'home' || volume === '/home' || volume === '/windows-home') {
       return res.status(403).json({ error: "Restricted" });
    }

    const now = Date.now();
    const cachedEntry = cacheMap.get(targetDir);

    if (cachedEntry && (now - cachedEntry.timestamp < STORAGE_CACHE_DURATION)) {
      console.log(`[API] Serving ${targetDir} from cache.`);
      return res.status(200).json({ user_storage: cachedEntry.data });
    }

    try {
      console.log(`[API] Scanning storage for: ${targetDir}...`);
      const headNode = CLUSTER_NODES[0] as unknown as NodeConfig;
      
      const userStorage = await fetchUserStorage(headNode, targetDir);
      
      if (userStorage.length > 0) {
        cacheMap.set(targetDir, { data: userStorage, timestamp: now });
      }
      
      return res.status(200).json({ user_storage: userStorage });
    } catch (error: any) {
      console.error(`[API] Storage Error:`, error);
      return res.status(500).json({ error: "Failed to fetch storage" });
    }
  }
}