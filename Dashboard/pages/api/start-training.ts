import { NextApiRequest, NextApiResponse } from 'next';
import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Destructure the payload
  const { config, nodeName } = req.body;
  const runId = `run_${Date.now()}`;
  
  // --- CONFIGURATION ---
  // Where is the code located ON THE SERVER?
  const CODE_DIR = `/scratch/software/NeuroCore/Benchmarking`; 
  const PYTHON_EXEC = `python3`; 
  
  // Where to save results?
  const REMOTE_EXP_DIR = `/scratch/experiments/${runId}`;
  // ---------------------

  // 2. Load Node Configs
  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
  
  // 3. Find the Target Node (e.g., cloud-243)
  const targetNode = nodesConfig.nodes.find(n => n.name === nodeName);

  if (!targetNode) {
    return res.status(400).json({ error: `Node '${nodeName}' not found in configuration.` });
  }

  const ssh = new NodeSSH();

  try {
    console.log(`[Training] Connecting to ${targetNode.name} (${targetNode.host})...`);
    
    // 4. Connect to the SPECIFIC GPU Node
    await ssh.connect({
      host: targetNode.host,
      username: targetNode.user,
      password: process.env.SSH_PASSWORD,
      port: targetNode.port,
      readyTimeout: 20000,
    });

    // 5. Setup Remote Directory
    await ssh.execCommand(`mkdir -p ${REMOTE_EXP_DIR}`);

    // 6. Create & Upload Config
    const localConfigPath = `/tmp/${runId}_config.json`;
    fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2));
    await ssh.putFile(localConfigPath, `${REMOTE_EXP_DIR}/config.json`);

    // 7. Run Command
    // Important: We CD into the code directory so imports work
    const command = `cd ${CODE_DIR} && nohup ${PYTHON_EXEC} main.py --config ${REMOTE_EXP_DIR}/config.json > ${REMOTE_EXP_DIR}/training.log 2>&1 &`;
    
    console.log(`[Training] Executing on ${targetNode.name}:`, command);
    const result = await ssh.execCommand(`${command} echo $!`);

    fs.unlinkSync(localConfigPath);
    ssh.dispose();

    return res.status(200).json({ 
      success: true, 
      runId, 
      node: targetNode.name,
      pid: result.stdout.trim(),
      path: REMOTE_EXP_DIR 
    });

  } catch (error: any) {
    console.error("[Training API] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}