import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    
    if (!fs.existsSync(snapshotDir)) {
      return res.status(200).json([]);
    }

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));

    // Limit to 24h of data (approx 288 files)
    const MAX_FILES = 288; 
    
    files.sort(); 
    const recentFiles = files.slice(-MAX_FILES);

    const snapshots = recentFiles.map(file => {
      try {
        const filePath = path.join(snapshotDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
      } catch {
        return null;
      }
    }).filter(Boolean);

    res.status(200).json(snapshots);

  } catch (e) {
    console.error("[History API] Error:", e);
    res.status(500).json({ error: "Failed to read history" });
  }
}