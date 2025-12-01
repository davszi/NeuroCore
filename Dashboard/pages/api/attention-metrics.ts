import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface MetricEntry {
  timestamp: string;
  type: string;
  step: number;
  epoch: number;
  loss: number;
  perplexity: number;
  learning_rate: number;
  training_time_seconds: number;
  training_time_hours: number;
  'cpu_usage_%': number;
  ram_usage_GB: number;
  gpu_mem_GB: number;
  note: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test: Return basic info first
    if (req.query.test === 'true') {
      const cwd = process.cwd();
      const sdpaPath = path.join(cwd, '..', 'Benchmarking', 'sdpa_attention.jsonl');
      const flashPath = path.join(cwd, '..', 'Benchmarking', 'metrics_flash.jsonl');
      return res.status(200).json({
        cwd,
        sdpaPath,
        flashPath,
        sdpaExists: fs.existsSync(sdpaPath),
        flashExists: fs.existsSync(flashPath),
      });
    }
    // process.cwd() is Dashboard folder, go up one level to project root
    const cwd = process.cwd();
    const sdpaPath = path.join(cwd, '..', 'Benchmarking', 'sdpa_attention.jsonl');
    const flashPath = path.join(cwd, '..', 'Benchmarking', 'metrics_flash.jsonl');

    // Read and parse JSONL files
    const readJsonl = (filePath: string): MetricEntry[] => {
      if (!fs.existsSync(filePath)) {
        console.error(`[attention-metrics] File not found: ${filePath}`);
        return [];
      }
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content
          .split('\n')
          .filter(line => line.trim())
          .map((line, index) => {
            try {
              return JSON.parse(line);
            } catch (parseError) {
              console.error(`[attention-metrics] Failed to parse line ${index + 1} in ${filePath}:`, parseError);
              return null;
            }
          })
          .filter((entry): entry is MetricEntry => entry !== null);
      } catch (readError) {
        console.error(`[attention-metrics] Failed to read file ${filePath}:`, readError);
        return [];
      }
    };

    const sdpaData = readJsonl(sdpaPath);
    const flashData = readJsonl(flashPath);

    // If both files are empty, return error
    if (sdpaData.length === 0 && flashData.length === 0) {
      return res.status(404).json({
        error: 'No data found',
        details: 'Both JSONL files are empty or not found',
        paths: {
          sdpaPath,
          flashPath,
          sdpaExists: fs.existsSync(sdpaPath),
          flashExists: fs.existsSync(flashPath),
        }
      });
    }

    // Calculate runtime per epoch
    const calculateRuntimePerEpoch = (data: MetricEntry[]) => {
      if (!data || data.length === 0) {
        return [];
      }
      
      // Group entries by epoch
      const epochMap: Record<number, MetricEntry[]> = {};
      
      data.forEach(entry => {
        const epochNum = Math.floor(entry.epoch);
        if (!epochMap[epochNum]) {
          epochMap[epochNum] = [];
        }
        epochMap[epochNum].push(entry);
      });

      const sortedEpochs = Object.keys(epochMap).map(Number).sort((a, b) => a - b);
      
      return sortedEpochs.map((epoch, index) => {
        const epochEntries = epochMap[epoch];
        
        // Sort entries by training_time_seconds to get first and last
        epochEntries.sort((a, b) => a.training_time_seconds - b.training_time_seconds);
        const firstEntry = epochEntries[0];
        const lastEntry = epochEntries[epochEntries.length - 1];
        
        // For epoch 0, runtime is the time to complete epoch 0
        if (index === 0) {
          return {
            epoch,
            runtime_seconds: lastEntry.training_time_seconds - firstEntry.training_time_seconds || lastEntry.training_time_seconds,
          };
        }
        
        // For subsequent epochs, runtime is time from previous epoch's end to this epoch's end
        const prevEpoch = sortedEpochs[index - 1];
        const prevEpochEntries = epochMap[prevEpoch];
        prevEpochEntries.sort((a, b) => a.training_time_seconds - b.training_time_seconds);
        const prevEpochEndTime = prevEpochEntries[prevEpochEntries.length - 1].training_time_seconds;
        
        const epochRuntime = lastEntry.training_time_seconds - prevEpochEndTime;
        
        return {
          epoch,
          runtime_seconds: epochRuntime > 0 ? epochRuntime : (lastEntry.training_time_seconds - firstEntry.training_time_seconds),
        };
      });
    };

    const sdpaRuntimePerEpoch = calculateRuntimePerEpoch(sdpaData);
    const flashRuntimePerEpoch = calculateRuntimePerEpoch(flashData);

    return res.status(200).json({
      sdpa: {
        data: sdpaData,
        runtimePerEpoch: sdpaRuntimePerEpoch,
      },
      flash: {
        data: flashData,
        runtimePerEpoch: flashRuntimePerEpoch,
      },
    });
  } catch (error: any) {
    console.error('[attention-metrics] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to load metrics',
      details: error.message
    });
  }
}

