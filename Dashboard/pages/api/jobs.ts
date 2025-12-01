import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (globalThis.CLUSTER_CACHE && globalThis.CLUSTER_CACHE.isReady) {
    return res.status(200).json(globalThis.CLUSTER_CACHE.jobs);
  }
  return res.status(503).json({ error: "System initializing..." });
}