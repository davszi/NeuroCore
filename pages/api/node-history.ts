import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// In-Memory Cache to prevent disk I/O spam
let historyCache: { data: any[], lastRead: number } = { data: [], lastRead: 0 };
const CACHE_TTL = 55 * 1000; // 55 seconds (fresh enough for 60s poll)

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const now = Date.now();
    
    // 1. Serve from cache if available and fresh
    if (historyCache.data.length > 0 && (now - historyCache.lastRead < CACHE_TTL)) {
       return res.status(200).json(historyCache.data);
    }

    const snapshotDir = path.join(process.cwd(), "data/node-history");
    if (!fs.existsSync(snapshotDir)) return res.status(200).json([]);

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));
    
    // 2. Optimization: Limit to recent 288 files (~24 hours)
    const MAX_FILES = 288; 
    files.sort(); 
    const recentFiles = files.slice(-MAX_FILES);

    const snapshots = recentFiles.map(file => {
      try {
        // This sync read is okay ONLY because we cache the result for 55s
        const filePath = path.join(snapshotDir, file);
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch { return null; }
    }).filter(Boolean);

    // 3. Update Cache
    historyCache = { data: snapshots, lastRead: now };

    res.status(200).json(snapshots);

  } catch (e) {
    console.error("[History API] Error:", e);
    res.status(500).json({ error: "Failed to read history" });
  }
}