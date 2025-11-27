import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeSSH } from 'node-ssh';

export interface Job {
  node: string;
  user: string;
  pid: number;
  process_name: string;
  gpu_memory_usage_mib: number; // 0 if CPU job
  cpu_percent?: number; // only for CPU jobs
}

interface NodeConfig {
  name: string;
  host: string;
  port: number;
  user: string;
}

async function pollNodeForJobs(node: NodeConfig, password: string): Promise<Job[]> {
  const ssh = new NodeSSH();
  const records: Job[] = [];

  try {
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      password,
    });

    // --- GPU Jobs ---
    const jobResultGPU = await ssh.execCommand(
      `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits`
    );

    if (jobResultGPU.code === 0 && jobResultGPU.stdout.trim() !== '') {
      jobResultGPU.stdout.trim().split('\n').forEach((line) => {
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
    const jobResultCPU = await ssh.execCommand(
      `ps -eo pid,user,%cpu,comm --sort=-%cpu | head -n 20`
    );

    if (jobResultCPU.code === 0 && jobResultCPU.stdout.trim() !== '') {
      jobResultCPU.stdout
        .trim()
        .split('\n')
        .slice(1) // skip header
        .forEach((line) => {
          const parts = line.trim().split(/\s+/, 4);
          if (parts.length < 4) return;

          const pid = parseInt(parts[0]);
          const user = parts[1];
          const cpu_percent = parseFloat(parts[2]);
          const process_name = parts[3];

          records.push({
            node: node.name,
            user,
            pid,
            process_name: `${process_name} (CPU)`,
            gpu_memory_usage_mib: 0,
            cpu_percent,
          });
        });
    }

    ssh.dispose();
    return records;
  } catch (e) {
    ssh.dispose();
    console.error(`Failed to poll jobs from ${node.name}:`, e);
    return [];
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const password = 'WeAreNeuroCore';

  let nodesConfig: { nodes: NodeConfig[] } = { nodes: [] };
  try {
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read nodes config.', details: (e as Error).message });
  }

  const results = await Promise.all(nodesConfig.nodes.map((node) => pollNodeForJobs(node, password)));
  const allJobs: Job[] = results.flat();

  res.status(200).json(allJobs);
}
