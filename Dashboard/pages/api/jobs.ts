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
const JOB_CMD = `ps -u $USER -ww -o pid,etime,args --no-headers | grep 'python' | grep -v 'grep'`;

const SSH_PASSWORD = process.env.NEUROCORE_SSH_PASSWORD?.trim() || undefined;

function buildSshConfig(node: NodeConfig) {
  const config: {
    host: string;
    port: number;
    username: string;
    password?: string;
  } = {
    host: node.host,
    port: node.port,
    username: node.user,
  };

  if (SSH_PASSWORD) {
    config.password = SSH_PASSWORD;
  }

  return config;
}

/**
 * Helper function to poll a node for jobs
 */
async function pollNodeForJobs(node: NodeConfig): Promise<Job[]> {
  const ssh = new NodeSSH();
  const records: Job[] = [];

  try {
    // ✅ 2. Connect using the new library's syntax
    await ssh.connect(buildSshConfig(node));

    const jobResult = await ssh.execCommand(JOB_CMD);
    console.log(`Polled jobs from ${node.name}:`, jobResult);

    // ✅ 3. Check for 'stdout' property and success
    if (jobResult.code === 0 && jobResult.stdout.trim() !== '') {
      jobResult.stdout.trim().split('\n').forEach((line: string) => {
        const parsed = line.trim().match(/^(\S+)\s+(\S+)\s+(.*)$/);
        if (!parsed) return;

        const [, pidString, uptime, command] = parsed;
        const ownerMatch = command.match(/--owner\s+([^\s]+)/);
        const projectMatch = command.match(/--project\s+([^\s]+)/);
        const modeMatch = command.match(/--mode\s+([^\s]+)/);

        const owner = ownerMatch?.[1] ?? 'unknown';
        const project = projectMatch?.[1];
        const mode = modeMatch?.[1];

        const sessionName =
          owner !== 'unknown' && project && mode
            ? `train:${owner}:${project}:${mode}`
            : command.split(' ')[0].split('/').pop() || 'python_job';

        records.push({
          node: node.name,
          session: sessionName,
          pid: parseInt(pidString, 10),
          uptime,
          log_preview: [command], // Show the full command as the "log"
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