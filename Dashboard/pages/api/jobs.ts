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

// It queries *only* for compute processes and returns parseable CSV.
const JOB_CMD = `nvidia-smi --query-compute-apps=pid,process_name,used_gpu_memory --format=csv,noheader,nounits`;

/**
 * Helper function to poll a node for jobs
 */
async function pollNodeForJobs(
  node: NodeConfig,
  privateKey: string
): Promise<Job[]> {
  const ssh = new NodeSSH();
  const records: Job[] = [];

  try {
    // 1. Connect using SSH Key
    console.log(`[jobs] [${node.name}] Connecting to ${node.user}@${node.host} using SSH key...`);
    await ssh.connect({
      host: node.host,
      port: node.port,
      username: node.user,
      privateKey: privateKey
    });
    console.log(`[jobs] [${node.name}] Connected.`);

    // 2. Execute the job command
    const jobResult = await ssh.execCommand(JOB_CMD);

    // 3. Check for 'stdout' property and success
    // This will only run if the command succeeded (i.e., it's a GPU node)
    if (jobResult.code === 0 && jobResult.stdout.trim() !== '') {
      jobResult.stdout.trim().split('\n').forEach((line: string) => {
        const parts = line.split(', '); // Split the CSV output
        if (parts.length < 3) return;

        const pid = parseInt(parts[0]);
        const process_name = parts[1];
        const memory_usage_mib = parseFloat(parts[2]);

        // Extract the username from the command path
        const pathParts = process_name.split('/');
        let user = 'unknown';
        if (pathParts.length > 2 && pathParts[1] === 'scratch') {
          user = pathParts[2]; 
        }

        records.push({
          node: node.name,
          user: user,
          pid: pid,
          process_name: process_name,
          gpu_memory_usage_mib: memory_usage_mib,
        });
      });
    }
    
    // 4. Close the connection
    ssh.dispose();
    console.log(`[jobs] [${node.name}] ✅ Successfully polled jobs. Found ${records.length}.`);
    return records;

  } catch (e) {
    const error = e as Error;
    // --- THIS IS THE KEY ---
    // This command will fail on CPU nodes (244, 248) because 'nvidia-smi' doesn't exist.
    // We catch the error and log it as a non-critical event.
    if (error.message.includes('Command failed')) {
      console.log(`[jobs] [${node.name}] ✅ No GPU jobs found (this is a CPU node or nvidia-smi failed).`);
    } else {
      // This is a real connection error
      console.error(`[jobs] ❌ Failed to poll jobs from ${node.name}: ${error.message}`);
    }
    ssh.dispose(); // Always dispose on error
    return []; // Return empty array
  }
}

/**
 * The main API Handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  console.log(`\n\n--- [jobs-handler] Received request for /api/jobs at ${new Date().toISOString()} ---`);
  
  let privateKey: string | undefined;
  let nodesConfig;

  try {
    // 1. Read the SSH private key from Environment Variables
    console.log("[jobs-handler] Reading SSH private key from environment...");
    privateKey = process.env.SSH_PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error("Missing SSH_PRIVATE_KEY environment variable. Cannot authenticate.");
    }
    // Fix for multi-line key in .env.local
    privateKey = privateKey.replace(/\\n/g, '\n'); 
    console.log("[jobs-handler] Successfully loaded private key from environment.");

    // 2. Read the config file
    // We use the correct '../config/' path
    const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
    console.log(`[jobs-handler] Reading nodes config from: ${nodesPath}`);
    nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };

  } catch (e) {
    console.error(`[jobs-handler] ❌ CRITICAL ERROR IN MAIN HANDLER (SETUP) !!!`);
    console.error(`!!! Error Message: ${(e as Error).message}`);
    return res.status(500).json({ error: 'Failed to read config or key.', details: (e as Error).message });
  }

  // 3. Poll all nodes in parallel
  // This is correct. GPU nodes will return jobs. CPU nodes will return [].
  console.log(`[jobs-handler] Polling all ${nodesConfig.nodes.length} nodes for jobs...`);
  const pollPromises = nodesConfig.nodes.map(node => pollNodeForJobs(node, privateKey));
  const results = await Promise.all(pollPromises);

  // 4. Flatten the results
  const allJobs: Job[] = results.flat();

  console.log(`[jobs-handler] Sending successful 200 response. Found ${allJobs.length} total GPU jobs.`);
  res.status(200).json(allJobs);
}