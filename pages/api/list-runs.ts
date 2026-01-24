import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodeName } = req.query;
  if (!nodeName) return res.status(400).json({ error: "No nodeName provided" });

  const HISTORY_DIR = path.join(process.cwd(), 'data/ml-history', nodeName as string);

  try {
    if (!fs.existsSync(HISTORY_DIR)) {
        return res.status(200).json({ runs: [] });
    }

    // Read folders in data/ml-history/<nodeName>
    const runs = fs.readdirSync(HISTORY_DIR)
        .filter(name => name.startsWith('run_') && fs.statSync(path.join(HISTORY_DIR, name)).isDirectory())
        .map(runId => {
            const ts = parseInt(runId.replace('run_', ''));
            const date = isNaN(ts) ? 'Unknown' : new Date(ts * 1000).toLocaleString();
            
            return {
                id: runId,
                display: `Run ${runId.replace('run_', '')} (${date})`,
                timestamp: ts,
                node: nodeName
            };
        })
        .sort((a, b) => b.timestamp - a.timestamp); // Newest first

    return res.status(200).json({ runs });

  } catch (error: any) {
    console.error(`[API] List Runs Error:`, error.message);
    return res.status(200).json({ runs: [] });
  }
}