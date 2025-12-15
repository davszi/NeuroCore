import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { runCommand, createConnection } from '@/lib/ssh'; 
import { CLUSTER_NODES } from '@/lib/config'; 
import { NodeConfig } from '@/types/cluster';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    ),
  ]);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { config, nodeName } = req.body;
  const runId = `run_${Date.now()}`;
  
  console.log(`\n🔵 [API] STARTING TRAINING: ${runId} on ${nodeName}`);

  const PROJECT_ROOT = `/scratch/mw86/NeuroCore`;
  const PYTHON_EXEC = `./bench_env/bin/python`; 
  const SCRIPT_PATH = `Benchmarking/main.py`;   
  const REMOTE_EXP_DIR = `/scratch/mw86/experiments/${runId}`;
  
  const localConfigPath = `/tmp/${runId}_config.json`;

  let ssh;
  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(400).json({ error: `Node '${nodeName}' not found.` });

    fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2));

    console.log(`🟡 [API] Connecting to ${targetNode.name}...`);
    ssh = await createConnection(targetNode);
    
    await ssh.execCommand(`mkdir -p ${REMOTE_EXP_DIR}`);
    
    await ssh.putFile(localConfigPath, `${REMOTE_EXP_DIR}/config.json`);
    console.log(`📦 [API] Config uploaded successfully.`);

    const envVars = `export UV_CACHE_DIR="/scratch/mw86/uv_cache" && export HF_HOME="/scratch/mw86/hf_cache"`;
    
    const bashLogic = `( ${envVars} && cd ${PROJECT_ROOT} && nohup ${PYTHON_EXEC} ${SCRIPT_PATH} --config ${REMOTE_EXP_DIR}/config.json > ${REMOTE_EXP_DIR}/training.log 2>&1 < /dev/null ) > /dev/null 2>&1 & echo $! ; exit 0`;

    const trainCmd = `bash -c '${bashLogic}'`;
    
    console.log(`🚀 [API] Launching training script...`);
    
    const result = await withTimeout(ssh.execCommand(trainCmd), 8000);
    
    const outputLines = result.stdout.trim().split('\n');
    const pid = outputLines[outputLines.length - 1].trim();

    if (!pid || isNaN(Number(pid))) {
        throw new Error(`Failed to get valid PID. Output: "${result.stdout}" Stderr: "${result.stderr}"`);
    }

    console.log(`✅ [API] SUCCESS! PID: ${pid}`);

    return res.status(200).json({ success: true, runId, node: targetNode.name, pid, path: REMOTE_EXP_DIR });

  } catch (error: any) {
    console.error(`🔴 [API] ERROR:`, error.message);
    return res.status(500).json({ error: "Failed to start training", details: error.message });
  } finally {
    if (fs.existsSync(localConfigPath)) fs.unlinkSync(localConfigPath);
    if (ssh) ssh.dispose();
  }
}