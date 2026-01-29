import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

interface Job {
  node: string;
  user: string; 
  pid: number;
  process_name: string;
  gpu_memory_usage_mib: number; 
}

interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
}

const JOB_CMD = `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits`;

async function pollNodeForJobs(
  node: NodeConfig,
  password: string
): Promise<Job[]> {
  const ssh = new NodeSSH();
  const records: Job[] = [];

  try {
    console.log(`[jobs] [${node.name}] Connecting to ${node.user}@${node.host} using password...`);

    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password: ""
    });

    console.log(`[jobs] [${node.name}] Connected.`);

    const jobResult = await ssh.execCommand(JOB_CMD);

    if (jobResult.code === 0 && jobResult.stdout.trim() !== '') {
      jobResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.split(', ');
        if (parts.length < 3) return;

        const pid = parseInt(parts[0]);
        const process_name = parts[1];
        const memory_usage_mib = parseFloat(parts[2]);

        let user = 'unknown';
        const pathParts = process_name.split('/');
        if (pathParts.length > 2 && pathParts[1] === 'scratch') {
          user = pathParts[2];
        }

        records.push({
          node: node.name,
          user,
          pid,
          process_name,
          gpu_memory_usage_mib: memory_usage_mib,
        });
      });
    }
    
    ssh.dispose();
    console.log(`[jobs] [${node.name}] ✅ Successfully polled jobs. Found ${records.length}.`);
    return records;

  } catch (e) {
    const error = e as Error;

    if (error.message.includes('Command failed')) {
      console.log(`[jobs] [${node.name}] ✅ No GPU jobs found (CPU node or nvidia-smi failed).`);
    } else {
      console.error(`[jobs] ❌ Failed to poll jobs from ${node.name}: ${error.message}`);
    }

    ssh.dispose();
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  console.log(`\n\n--- [jobs-handler] Request received at ${new Date().toISOString()} ---`);

  let password = ""; // 🔥 Password directly used

  let nodesConfig;

  try {
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    console.log(`[jobs-handler] Reading nodes config from: ${nodesPath}`);
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };

  } catch (e) {
    console.error(`[jobs-handler] ❌ CRITICAL ERROR: Failed to load config.`);
    return res.status(500).json({ error: 'Failed to read config file.', details: (e as Error).message });
  }

  console.log(`[jobs-handler] Polling all ${nodesConfig.nodes.length} nodes for jobs...`);

  const pollPromises = nodesConfig.nodes.map(node => pollNodeForJobs(node, password));
  const results = await Promise.all(pollPromises);

  const allJobs: Job[] = results.flat();

  console.log(`[jobs-handler] ✅ Sending 200 response. Found ${allJobs.length} jobs.`);
  res.status(200).json(allJobs);
}
