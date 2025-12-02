import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    
    if (!fs.existsSync(snapshotDir)) return res.status(404).json({});

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));
    if (files.length === 0) return res.status(404).json({});

    files.sort();
    const latestFile = files[files.length - 1];
    
    const content = fs.readFileSync(path.join(snapshotDir, latestFile), 'utf8');
    const data = JSON.parse(content);

    res.status(200).json(data);
  } catch {
    // FIXED: Removed unused 'e' variable
    res.status(500).json({ error: "Preview error" });
  }
}