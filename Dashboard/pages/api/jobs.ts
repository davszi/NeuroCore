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
  cpu_percent?: number;
}

interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
}

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
      username: process.env.SSH_USERNAME || node.user,
      password: process.env.SSH_PASSWORD,
    });

    console.log(`[jobs] [${node.name}] Connected.`);

    // --- GPU Jobs ---
    const JOB_CMD_GPU = `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits`;
    const jobResultGPU = await ssh.execCommand(JOB_CMD_GPU);

    if (jobResultGPU.code === 0 && jobResultGPU.stdout.trim() !== '') {
      jobResultGPU.stdout.trim().split('\n').forEach((line: string) => {
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

    // --- CPU Jobs ---
    // Get top CPU-consuming processes (PID, USER, %CPU, COMMAND)
    const JOB_CMD_CPU = `ps -eo pid,user,%cpu,comm --sort=-%cpu | head -n 20`;
    const jobResultCPU = await ssh.execCommand(JOB_CMD_CPU);

    if (jobResultCPU.code === 0 && jobResultCPU.stdout.trim() !== '') {
      // skip header line
      jobResultCPU.stdout.trim().split('\n').slice(1).forEach((line: string) => {
        const match = line.trim().split(/\s+/, 4);
        if (match.length < 4) return;

        const pid = parseInt(match[0]);
        const user = match[1];
        const cpu_percent = parseFloat(match[2]);
        const process_name = match[3];

        records.push({
          node: node.name,
          user,
          pid,
          process_name: `${process_name} (CPU)`,
          gpu_memory_usage_mib: 0, // mark as CPU job
        });
      });
    }

    ssh.dispose();
    console.log(`[jobs] [${node.name}] ✅ Successfully polled jobs. Found ${records.length}.`);
    return records;

  } catch (e) {
    const error = e as Error;

    if (error.message.includes('Command failed')) {
      console.log(`[jobs] [${node.name}] ✅ No GPU or CPU jobs found.`);
    } else {
      console.error(`[jobs] ❌ Failed to poll jobs from ${node.name}: ${error.message}`);
    }

    ssh.dispose();
    return [];
  }
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const password = 'Pratham@14'; 

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
