import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const snapshotDir = path.join(process.cwd(), "data/node-history");
    if (!fs.existsSync(snapshotDir)) {
      return res.status(200).json([]);
    }

    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".json"));
    const snapshots = files
      .sort() // oldest -> newest
      .map(file => {
        const content = fs.readFileSync(path.join(snapshotDir, file), "utf-8");
        return JSON.parse(content);
      });

    res.status(200).json(snapshots);
  } catch (e) {
    res.status(500).json({ error: "Failed to read snapshots", details: (e as Error).message });
  }
}
