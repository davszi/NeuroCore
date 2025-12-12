import { NextApiRequest, NextApiResponse } from 'next';
import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { config, nodeName } = req.body;
  const runId = `run_${Date.now()}`;
  
  console.log(`[API] Received request to start training on ${nodeName}`);

  // --- CONFIGURATION ---
  const PROJECT_ROOT = `/scratch/mw86/NeuroCore`;
  const PYTHON_EXEC = `./bench_env/bin/python`; 
  const SCRIPT_PATH = `Benchmarking/main.py`; 
  const REMOTE_EXP_DIR = `/scratch/mw86/experiments/${runId}`;
  // -----------------------------------------------------

  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
  
  const targetNode = nodesConfig.nodes.find(n => n.name === nodeName);

  if (!targetNode) {
    console.error(`[API] Node ${nodeName} not found in yaml.`);
    return res.status(400).json({ error: `Node '${nodeName}' not found.` });
  }

  const ssh = new NodeSSH();

  try {
    console.log(`[API] Connecting to ${targetNode.host} as ${targetNode.user}...`);
    
    // 1. Connect
    await ssh.connect({
      host: targetNode.host,
      username: targetNode.user,
      password: process.env.SSH_PASSWORD, // Must be in .env.local
      port: targetNode.port,
      readyTimeout: 20000, 
      tryKeyboard: true // Helps with some strict SSH servers
    });

    console.log(`[API] Connected! Preparing directory: ${REMOTE_EXP_DIR}`);

    // 2. Setup Remote Directory
    await ssh.execCommand(`mkdir -p ${REMOTE_EXP_DIR}`);

    // 3. Upload Config
    const localConfigPath = `/tmp/${runId}_config.json`;
    fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2));
    await ssh.putFile(localConfigPath, `${REMOTE_EXP_DIR}/config.json`);
    console.log(`[API] Config uploaded.`);

    // 4. Construct Command
    // We use the exact paths that worked in your manual test
    const envVars = `export UV_CACHE_DIR="/scratch/mw86/uv_cache" && export HF_HOME="/scratch/mw86/hf_cache"`;
    
    // Note: We use 'nohup' so it runs in background
    const command = `${envVars} && cd ${PROJECT_ROOT} && nohup ${PYTHON_EXEC} ${SCRIPT_PATH} --config ${REMOTE_EXP_DIR}/config.json > ${REMOTE_EXP_DIR}/training.log 2>&1 &`;
    
    console.log(`[API] Executing command: ${command}`);
    
    const result = await ssh.execCommand(`${command} echo $!`);

    fs.unlinkSync(localConfigPath);
    ssh.dispose();

    if (result.stderr && !result.stdout) {
      console.warn(`[API] Warning during execution: ${result.stderr}`);
    }

    console.log(`[API] Success. PID: ${result.stdout.trim()}`);

    return res.status(200).json({ 
      success: true, 
      runId, 
      node: targetNode.name,
      pid: result.stdout.trim(),
      path: REMOTE_EXP_DIR 
    });

  } catch (error: any) {
    console.error("[API] CRITICAL ERROR:", error);
    return res.status(500).json({ 
      error: "Failed to start training", 
      details: error.message 
    });
  }
}