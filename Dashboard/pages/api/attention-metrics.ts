import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { MetricEntry } from '@/types/cluster';

// FIXED: Now uses 'ml-history' (hyphen) to match your server folder
const LOCAL_HISTORY_DIR = path.join(process.cwd(), 'data', 'ml-history');

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
    'cpu_usage_%': Number(raw['cpu_usage_%'] || raw.cpu_usage_percent || 0),
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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!fs.existsSync(LOCAL_HISTORY_DIR)) {
      console.log(`[Metrics] Directory not found: ${LOCAL_HISTORY_DIR}`);
      return res.status(200).json({ sdpa: null, flash: null });
    }

    const files = fs.readdirSync(LOCAL_HISTORY_DIR).filter(f => f.endsWith('.jsonl'));
    const metricsData: any = { sdpa: null, flash: null };

    files.forEach(file => {
      try {
        const content = fs.readFileSync(path.join(LOCAL_HISTORY_DIR, file), 'utf-8');
        const dataPoints = content
          .split('\n')
          .filter(Boolean)
          .map(line => {
            try { return normalizeMetric(JSON.parse(line)); } catch { return null; }
          })
          .filter((d): d is MetricEntry => d !== null);

        if (dataPoints.length > 0) {
          const type = file.toLowerCase().includes('sdpa') ? 'sdpa' : 'flash';
          metricsData[type] = {
            runId: file, 
            config: { 
              attention: { ui_choice: type },
              model_name: "Local Log File",
              dataset: { dataset_name: "Local History" }
            },
            data: dataPoints,
            runtimePerEpoch: calculateRuntimePerEpoch(dataPoints)
          };
        }
      } catch (err) {
        console.error(`[Metrics] Error reading ${file}:`, err);
      }
    });

    return res.status(200).json(metricsData);

  } catch (error: any) {
    console.error("[Metrics API] Critical Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}