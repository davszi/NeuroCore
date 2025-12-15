import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { CLUSTER_NODES } from '@/lib/config';
import { createConnection } from '@/lib/ssh'; 
import { MetricEntry, NodeConfig } from '@/types/cluster';

const REMOTE_EXPERIMENTS_DIR = '/scratch/mw86/experiments';
const CACHE_TTL_MS = 30 * 1000;

globalThis.METRICS_CACHE = globalThis.METRICS_CACHE || { data: null, lastUpdated: 0 };
declare global { var METRICS_CACHE: { data: any; lastUpdated: number; }; }

const normalizeMetric = (raw: any): MetricEntry => {
  return {
    timestamp: raw.timestamp || new Date().toISOString(),
    type: raw.type || 'metric',
    step: Number(raw.step || 0),
    epoch: Number(raw.epoch || 0),
    loss: Number(raw.loss || 0),
    perplexity: Number(raw.perplexity || 0),
    learning_rate: Number(raw.learning_rate || 0),
    
    training_time_seconds: Number(raw.training_time_seconds || raw.time_seconds || 0),
    training_time_hours: Number(raw.training_time_hours || raw.time_hours || 0),
    
    'cpu_usage_%': Number(raw['cpu_usage_%'] || raw.cpu_usage_percent || raw.cpu_percent || 0),
    ram_usage_GB: Number(raw.ram_usage_GB || raw.ram_gb || 0),
    gpu_mem_GB: Number(raw.gpu_mem_GB || raw.gpu_memory_gb || 0),
    
    note: raw.note || '',
    runtime_seconds: 0, 
  };
};

const calculateRuntimePerEpoch = (data: MetricEntry[]) => {
  if (!data || data.length === 0) return [];
  const epochMap: Record<number, number[]> = {};

  data.forEach((entry: any) => {
    const epochNum = Math.ceil(entry.epoch); 
    if (epochNum === 0) return;
    const timeMs = new Date(entry.timestamp).getTime();
    if (!epochMap[epochNum]) epochMap[epochNum] = [];
    epochMap[epochNum].push(timeMs);
  });

  return Object.keys(epochMap).map((key) => {
    const epoch = parseInt(key);
    const times = epochMap[epoch];
    const runtime = (Math.max(...times) - Math.min(...times)) / 1000;
    return { epoch, runtime_seconds: runtime > 0 ? runtime : 0 };
  }).sort((a, b) => a.epoch - b.epoch);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const now = Date.now();
  if (globalThis.METRICS_CACHE.data && (now - globalThis.METRICS_CACHE.lastUpdated < CACHE_TTL_MS)) {
    return res.status(200).json(globalThis.METRICS_CACHE.data);
  }

  const node = (CLUSTER_NODES.find(n => n.hasGpu) || CLUSTER_NODES[0]) as unknown as NodeConfig;
  
  let ssh;
  try {
    ssh = await createConnection(node);

    const cmd = `ls -dt ${REMOTE_EXPERIMENTS_DIR}/*/ 2>/dev/null`;
    const result = await ssh.execCommand(cmd);
    const runDirs = result.stdout.split('\n').filter(Boolean).map(s => s.trim());

    const metricsData: any = { sdpa: null, flash: null };

    for (const dir of runDirs) {
      if (metricsData.sdpa && metricsData.flash) break;
      
      try {
        const configRaw = await ssh.execCommand(`cat ${dir}config.json`);
        if (!configRaw.stdout) continue;
        
        const config = JSON.parse(configRaw.stdout);
        const attentionType = config.attention?.ui_choice || config.attention; 
        
        if (metricsData[attentionType]) continue;

        const metricsRaw = await ssh.execCommand(`tail -n 1000 ${dir}step_metrics.jsonl`);
        if (!metricsRaw.stdout) continue;

        const dataPoints = metricsRaw.stdout
          .split('\n')
          .filter(Boolean)
          .map(line => {
             try { 
               const raw = JSON.parse(line);
               return normalizeMetric(raw); 
             } catch { return null; }
          })
          .filter((d): d is MetricEntry => d !== null);

        if (dataPoints.length === 0) continue;

        metricsData[attentionType] = {
          runId: path.basename(dir),
          config: config,
          data: dataPoints,
          runtimePerEpoch: calculateRuntimePerEpoch(dataPoints)
        };
      } catch (e) { 
        continue; 
      }
    }

    globalThis.METRICS_CACHE = { data: metricsData, lastUpdated: now };
    return res.status(200).json(metricsData);

  } catch (error: any) {
    console.error("[Metrics API] Error:", error.message);
    return res.status(500).json({ error: "Failed to fetch metrics" });
  } finally {
    if (ssh) ssh.dispose();
  }
}