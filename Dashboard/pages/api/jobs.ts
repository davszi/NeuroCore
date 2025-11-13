import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
// ✅ 1. Use the 'node-ssh' library
import { NodeSSH } from 'node-ssh';

// --- TYPE DEFINITIONS ---
interface Job {
  node: string;
  session: string;
  pid: number;
  uptime: string;
  log_preview: string[];
}
interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
}

// ℹ️ This is the command to find real running python jobs
const JOB_CMD = `ps -u $USER -o pid,etime,cmd --no-headers | grep 'python' | grep -v 'grep'`;

/**
 * Helper function to poll a node for jobs
 */
async function pollNodeForJobs(node: NodeConfig): Promise<Job[]> {
  const ssh = new NodeSSH();
  const records: Job[] = [];

  try {
    // ✅ 2. Connect using the new library's syntax
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: 'phie9aw7Lee7', // ❗️ Same password as in cluster-state.ts
    });

    const jobResult = await ssh.execCommand(JOB_CMD);

    // ✅ 3. Check for 'stdout' property and success
    if (jobResult.code === 0 && jobResult.stdout.trim() !== '') {
      jobResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.trim().split(/\s+/, 3); // Split into PID, ETIME, CMD
        if (parts.length < 3) return;

        records.push({
          node: node.name,
          session: parts[2].split(' ')[0].split('/').pop() || 'python_job', 
          pid: parseInt(parts[0]),
          uptime: parts[1],
          log_preview: [parts[2]], // Show the full command as the "log"
        });
      });
    }
    
    // ✅ 4. Close the connection
    ssh.dispose();
    return records;

  } catch (e) {
    console.error(`Failed to poll jobs from ${node.name}: ${(e as Error).message}`);
    ssh.dispose(); // ℹ️ Always dispose on error
    return []; // Return empty array on failure
  }
}

/**
 * The main API Handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  // 1. Read the config file
  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  let nodesConfig;
  try {
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read nodes.yaml.', details: (e as Error).message });
  }

  // 2. Poll all nodes in parallel
  const pollPromises = nodesConfig.nodes.map(pollNodeForJobs);
  const results = await Promise.all(pollPromises);

  // 3. Flatten the results
  const allJobs: Job[] = results.flat(); 

  res.status(200).json(allJobs);
}