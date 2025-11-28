import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    
    // Safety check: Create if it doesn't exist so we don't error out
    if (!fs.existsSync(snapshotDir)) {
      return res.status(200).json([]);
    }

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));
    
    // Get last 50 snapshots to prevent sending megabytes of data
    const recentFiles = files.sort().slice(-50); 

    const snapshots = recentFiles.map(file => {
      try {
        const content = fs.readFileSync(path.join(snapshotDir, file), "utf-8");
        return JSON.parse(content);
      } catch (e) {
        return null;
      }
    }).filter(Boolean); // Remove any nulls from failed reads

    res.status(200).json(snapshots);

  } catch (e) {
    res.status(500).json({ error: "Failed to read history", details: (e as Error).message });
  }
}