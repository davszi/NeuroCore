import { NextApiRequest, NextApiResponse } from 'next';
import { fetchUserStorage, fetchClusterStats } from '@/lib/fetchers';
import { UserStorage, NodeConfig } from '@/types/cluster';
import { CLUSTER_NODES } from '@/lib/config';

const cacheMap = new Map<string, { data: any; timestamp: number }>();
const STORAGE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for directory scans
const NODE_OVERVIEW_CACHE_DURATION = 30 * 1000; // 30 seconds for volume list

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { volume, node } = req.query;
  const cachedGlobal = globalThis.CLUSTER_CACHE?.clusterState;

  if (!volume) {
    // Case 1: Fetch storage overview (volumes) for a specific node
    if (typeof node === 'string') {
      const cacheKey = `volumes:${node}`;
      const now = Date.now();
      const cached = cacheMap.get(cacheKey);

      if (cached && (now - cached.timestamp < NODE_OVERVIEW_CACHE_DURATION)) {
        console.log(`[API] Serving volume list for ${node} from cache.`);
        return res.status(200).json({ storage: cached.data });
      }

      console.log(`[API] Fetching storage overview for node: ${node}...`);
      const targetNode = CLUSTER_NODES.find(n => n.name === node);

      if (!targetNode) {
        return res.status(404).json({ error: "Node not found" });
      }

      try {
        const stats = await fetchClusterStats(targetNode as unknown as NodeConfig, undefined);
        cacheMap.set(cacheKey, { data: stats.volumes, timestamp: now });
        return res.status(200).json({ storage: stats.volumes });
      } catch (e: any) {
        console.error(`[API] Failed to fetch node storage for ${node}:`, e);
        return res.status(500).json({ error: "Node storage fetch failed" });
      }
    }

    // Default: return global cluster state if no node/volume specified
    if (cachedGlobal) return res.status(200).json(cachedGlobal);
    return res.status(503).json({ error: "Initializing..." });
  }

  if (typeof volume === 'string') {
    let targetDir = '/scratch';
    if (volume.startsWith('/')) targetDir = volume;

    let nodeName = 'default';
    if (typeof req.query.node === 'string') {
      nodeName = req.query.node;
    } else {
      // identifying default node name
      nodeName = CLUSTER_NODES[0]?.name || 'cloud-243';
    }

    if (volume === 'home' || volume === '/home' || volume === '/windows-home') {
      const allowedNodes = ['cloud-202', 'cloud-203', 'cloud-204', 'cloud-205'];
      if (!allowedNodes.includes(nodeName)) {
        return res.status(403).json({ error: "Restricted" });
      }
    }

    const cacheKey = `${nodeName}:${targetDir}`;
    const now = Date.now();
    const cachedEntry = cacheMap.get(cacheKey);

    if (cachedEntry && (now - cachedEntry.timestamp < STORAGE_CACHE_DURATION)) {
      console.log(`[API] Serving ${targetDir} on ${nodeName} from cache.`);
      return res.status(200).json({ user_storage: cachedEntry.data });
    }

    try {
      console.log(`[API] Scanning storage for: ${targetDir} on node: ${nodeName}...`);

      let targetNode = CLUSTER_NODES[0] as unknown as NodeConfig;
      if (typeof req.query.node === 'string') {
        const foundNode = CLUSTER_NODES.find(n => n.name === req.query.node);
        if (foundNode) {
          targetNode = foundNode as unknown as NodeConfig;
        }
      }

      const userStorage = await fetchUserStorage(targetNode, targetDir);

      if (userStorage.length > 0) {
        cacheMap.set(cacheKey, { data: userStorage, timestamp: now });
      }

      return res.status(200).json({ user_storage: userStorage });
    } catch (error: any) {
      console.error(`[API] Storage Error:`, error);
      return res.status(500).json({ error: "Failed to fetch storage" });
    }
  }
}