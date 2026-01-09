import { NextApiRequest, NextApiResponse } from 'next';
import { MonthlyBenchmarkData } from '@/components/benchmarks/MonthlyComparisonChart';
import { CLUSTER_NODES, GPU_INVENTORY } from '@/lib/config';
import fs from 'fs';
import path from 'path';

// Path to store benchmark history
const BENCHMARK_DATA_DIR = path.join(process.cwd(), 'data', 'benchmark-history');

// Ensure data directory exists
if (!fs.existsSync(BENCHMARK_DATA_DIR)) {
  fs.mkdirSync(BENCHMARK_DATA_DIR, { recursive: true });
}

/**
 * Save benchmark results to monthly file with timestamps
 */
export function saveBenchmarkResults(results: any[]) {
  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filePath = path.join(BENCHMARK_DATA_DIR, `${monthStr}.json`);

    // Load existing data for this month
    let monthlyData: any[] = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      monthlyData = JSON.parse(fileContent);
    }

    // Add new results with timestamp
    results.forEach(result => {
      if (result.status === 'completed') {
        monthlyData.push({
          timestamp,  // Add timestamp for continuous timeline
          month: monthStr,
          gpuId: result.gpuId,
          gpuName: result.gpuName,
          nodeName: result.nodeName,
          metrics: {
            utilization_avg: result.metrics.utilization_avg,
            memory_used_avg: result.metrics.memory_used_avg,
            temperature_avg: result.metrics.temperature_avg,
            power_consumption_avg: result.metrics.power_consumption_avg,
            benchmark_score: result.metrics.benchmark_score || 0,
          },
        });
      }
    });

    // Save updated data
    fs.writeFileSync(filePath, JSON.stringify(monthlyData, null, 2));
    console.log(`✅ [Benchmark] Saved ${results.length} results to ${monthStr}.json at ${timestamp}`);
  } catch (error: any) {
    console.error('[Benchmark] Error saving results:', error.message);
  }
}

/**
 * API endpoint to fetch monthly benchmark comparison data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Generate last 6 months
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthStr);
    }

    // Load data from files
    const allData: MonthlyBenchmarkData[] = [];

    for (const month of months) {
      const filePath = path.join(BENCHMARK_DATA_DIR, `${month}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const monthData: MonthlyBenchmarkData[] = JSON.parse(fileContent);
          allData.push(...monthData);
        } catch (error) {
          console.error(`[Benchmark] Error reading ${month}.json:`, error);
        }
      }
    }

    // If no data exists, return empty array (not mock data)
    return res.status(200).json({
      data: allData,
    });
  } catch (error: any) {
    console.error('[Benchmark] Error fetching monthly data:', error);
    return res.status(500).json({ error: `Failed to fetch monthly data: ${error.message}` });
  }
}

