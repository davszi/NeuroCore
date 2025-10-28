import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

function readJsonlFile(filePath: string): any[] {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return fileContent.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const dataDir = path.join(process.cwd(), '../Simulation_Env/data-exchange');
  const jobsPath = path.join(dataDir, 'jobs.jsonl');
  
  const jobs = readJsonlFile(jobsPath);

  if (jobs.length === 0) {
    return res.status(500).json({ error: 'Failed to read simulation jobs.' });
  }

  res.status(200).json(jobs);
}