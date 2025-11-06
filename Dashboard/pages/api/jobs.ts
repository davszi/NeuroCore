import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Helper function
function readJsonlFile(filePath: string): any[] {
  try {
    // ✅ Check if file exists. If not, it's not an error, just return empty.
    if (!fs.existsSync(filePath)) {
      console.warn(`[API /api/jobs] File not found: ${filePath}. Returning empty array.`);
      return [];
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').filter(Boolean); // Filter empty lines

    // ✅ Check if file is empty. Not an error, just return empty.
    if (lines.length === 0) {
      console.warn(`[API /api/jobs] File is empty: ${filePath}. Returning empty array.`);
      return [];
    }
    
    return lines.map(line => JSON.parse(line));
  } catch (e) {
    console.error(`[API /api/jobs] Failed to read or parse ${filePath}:`, e);
    return []; // ✅ Return empty on any error
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // ℹ️ 1. Get the data path from an environment variable (set in docker-compose)
  //    2. If it's not set, fall back to the local path (for when you run 'npm run dev')
  const dataDir = process.env.DATA_PATH || path.join(process.cwd(), '../infrastructure/data');
  const jobsPath = path.join(dataDir, 'jobs.jsonl');
  
  const jobs = readJsonlFile(jobsPath);

  // ❌ --- BUG WAS HERE --- ❌
  // if (jobs.length === 0) {
  //   return res.status(500).json({ error: 'Failed to read simulation jobs.' });
  // }
  
  // ✅ --- FIX --- ✅
  // Always return 200 OK. If 'jobs' is an empty array, the frontend
  // will just show "No active jobs found."
  res.status(200).json(jobs);
}