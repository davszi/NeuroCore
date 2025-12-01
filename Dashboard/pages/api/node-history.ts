import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    
    // 1. Safety Check: Does folder exist?
    if (!fs.existsSync(snapshotDir)) {
      return res.status(200).json([]);
    }

    // 2. Read all filenames
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));

    // 3. Performance: Limit the number of files we read.
    // The worker saves every 5 mins. 
    // 12 files = 1 hour. 288 files = 24 hours.
    // We default to the last 288 files (24h) to keep the request fast.
    const MAX_FILES = 288; 
    
    // Sort to get the newest files at the end
    files.sort(); 
    
    // Slice to get only the last N files
    const recentFiles = files.slice(-MAX_FILES);

    // 4. Read files safely
    const snapshots = recentFiles.map(file => {
      try {
        const filePath = path.join(snapshotDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      } catch (e) {
        // If a file is corrupt, return null (don't crash)
        console.warn(`[History] Failed to parse ${file}`);
        return null;
      }
    }).filter(Boolean); // Remove nulls

    res.status(200).json(snapshots);

  } catch (e) {
    console.error("[History API] Error:", e);
    res.status(500).json({ error: "Failed to read history" });
  }
}