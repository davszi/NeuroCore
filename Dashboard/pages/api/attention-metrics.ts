import { NextApiRequest, NextApiResponse } from 'next';
import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NodeConfig, MetricEntry } from '@/types/cluster';

// --- CONFIGURATION ---
// This must match the directory used in 'start-training.ts'
const REMOTE_EXPERIMENTS_DIR = '/scratch/mw86/experiments';

// Helper to calculate runtime from timestamps
const calculateRuntimePerEpoch = (data: MetricEntry[]) => {
  if (!data || data.length === 0) return [];

  const epochMap: Record<number, number[]> = {};

  data.forEach((entry: any) => {
    // entry.timestamp is "YYYY-MM-DD HH:MM:SS"
    // entry.epoch is float (e.g. 0.15, 1.0, 1.25)
    const epochNum = Math.ceil(entry.epoch); 
    if (epochNum === 0) return; // Skip epoch 0 setup

    const timeMs = new Date(entry.timestamp).getTime();
    
    if (!epochMap[epochNum]) epochMap[epochNum] = [];
    epochMap[epochNum].push(timeMs);
  });

  // Calculate duration for each epoch (Max Time - Min Time)
  const results = Object.keys(epochMap).map((key) => {
    const epoch = parseInt(key);
    const times = epochMap[epoch];
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    // Duration in seconds
    const runtime_seconds = (maxTime - minTime) / 1000;

    return {
      epoch,
      runtime_seconds: runtime_seconds > 0 ? runtime_seconds : 0
    };
  });

  return results.sort((a, b) => a.epoch - b.epoch);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const nodesPath = path.join(process.cwd(), '../config/nodes.yaml');
  const nodesConfig = yaml.load(fs.readFileSync(nodesPath, 'utf8')) as { nodes: NodeConfig[] };
  
  // Use the first node to read files (assuming shared /scratch)
  const node = nodesConfig.nodes[0];
  const ssh = new NodeSSH();

  try {
    // 1. Connect to Server
    await ssh.connect({
      host: node.host,
      username: node.user,
      password: process.env.SSH_PASSWORD,
      port: node.port,
      readyTimeout: 20000,
    });

    // 2. List all experiment folders, sorted by date (newest first)
    // 'ls -dt' lists directories sorted by time
    const cmd = `ls -dt ${REMOTE_EXPERIMENTS_DIR}/*/ 2>/dev/null`;
    const result = await ssh.execCommand(cmd);
    
    // Clean up output into an array of paths
    const runDirs = result.stdout.split('\n').filter(Boolean).map(s => s.trim());

    const metricsData: any = {
      sdpa: null,
      flash: null
    };

    // 3. Search for the latest "Flash" run and latest "SDPA" run
    for (const dir of runDirs) {
      // If we found both, stop scanning
      if (metricsData.sdpa && metricsData.flash) break;

      try {
        // A. Read config.json to see which attention type this run used
        const configRaw = await ssh.execCommand(`cat ${dir}config.json`);
        if (!configRaw.stdout) continue; // Skip empty/missing config
        
        const config = JSON.parse(configRaw.stdout);
        
        // The attention type key (e.g., "flash" or "sdpa")
        // Check both 'ui_choice' or standard 'attention' field depending on your JSON structure
        const attentionType = config.attention?.ui_choice || config.attention; 

        // If we already have data for this type, skip it (we only want the newest)
        if (metricsData[attentionType]) continue;

        // B. Read the metrics logs
        // We assume 'step_metrics.jsonl' exists. We take the whole file.
        const metricsRaw = await ssh.execCommand(`cat ${dir}step_metrics.jsonl`);
        if (!metricsRaw.stdout) continue;

        // C. Parse JSONL
        const dataPoints = metricsRaw.stdout
          .split('\n')
          .filter(Boolean)
          .map(line => {
            try { return JSON.parse(line); } catch { return null; }
          })
          .filter((entry): entry is MetricEntry => entry !== null);

        if (dataPoints.length === 0) continue;

        // D. Calculate Derived Stats
        const runtimePerEpoch = calculateRuntimePerEpoch(dataPoints);

        // E. Store result
        metricsData[attentionType] = {
          runId: path.basename(dir),
          config: config,
          data: dataPoints,
          runtimePerEpoch: runtimePerEpoch
        };

      } catch (e) {
        // If a specific run folder is corrupted, just skip it
        console.warn(`[Metrics] Skipped corrupted run: ${dir}`);
        continue;
      }
    }

    ssh.dispose();

    // 4. Return Data
    // Even if one is missing (null), the frontend should handle it gracefully
    return res.status(200).json(metricsData);

  } catch (error: any) {
    console.error("[Metrics API] Error:", error);
    return res.status(500).json({ error: "Failed to fetch remote metrics", details: error.message });
  }
}