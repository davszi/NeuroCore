import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Check if worker has data
  if (globalThis.CLUSTER_CACHE && globalThis.CLUSTER_CACHE.isReady) {
    return res.status(200).json(globalThis.CLUSTER_CACHE.nodeState);
  }

  // 2. If worker hasn't finished first run yet
  return res.status(503).json({ error: "System initializing... please wait." });
}