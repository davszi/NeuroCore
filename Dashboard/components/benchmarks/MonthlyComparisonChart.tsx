import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export interface MonthlyBenchmarkData {
  timestamp?: string; // ISO timestamp of when benchmark was run
  month: string; // e.g., "2024-01", "2024-02"
  gpuId: string; // e.g., "cloud-243-gpu-0"
  gpuName?: string;
  nodeName?: string;
  metrics: {
    utilization_avg: number;
    memory_used_avg: number;
    temperature_avg: number;
    power_consumption_avg: number;
    benchmark_score?: number; // Optional performance score
  };
}

interface Props {
  data: MonthlyBenchmarkData[];
  metric: 'utilization' | 'memory' | 'temperature' | 'power' | 'score';
}

export default function MonthlyComparisonChart({ data, metric }: Props) {
  const chartData = useMemo(() => {
    // Sort by timestamp to show continuous flow
    const sortedData = [...data].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    // Group by timestamp (each benchmark run)
    const timestampMap: Record<string, Record<string, MonthlyBenchmarkData>> = {};

    sortedData.forEach(item => {
      const key = item.timestamp || item.month;
      if (!timestampMap[key]) {
        timestampMap[key] = {};
      }
      timestampMap[key][item.gpuId] = item;
    });

    // Convert to array format for Recharts
    const timestamps = Object.keys(timestampMap).sort();
    const gpuIds = Array.from(new Set(data.map(d => d.gpuId))).sort();

    return timestamps.map(ts => {
      const entry: any = {
        timestamp: ts,
        // Format display label
        label: ts.includes('T')
          ? new Date(ts).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
          : ts
      };

      gpuIds.forEach(gpuId => {
        const item = timestampMap[ts]?.[gpuId];
        if (item) {
          const value = item.metrics[
            metric === 'utilization' ? 'utilization_avg' :
              metric === 'memory' ? 'memory_used_avg' :
                metric === 'temperature' ? 'temperature_avg' :
                  metric === 'power' ? 'power_consumption_avg' :
                    'benchmark_score'
          ];
          entry[gpuId] = value ?? null;
        } else {
          entry[gpuId] = null;
        }
      });
      return entry;
    });
  }, [data, metric]);

  const colors = [
    '#3b82f6', '#ef4444', '#eab308', '#10b981',
    '#8b5cf6', '#f97316', '#06b6d4', '#ec4899'
  ];

  const gpuIds = Array.from(new Set(data.map(d => d.gpuId))).sort();

  const config = {
    utilization: { title: 'GPU Utilization Over Time', unit: '%', domain: [0, 100] as [number, number] },
    memory: { title: 'Memory Usage Over Time', unit: ' GB', domain: ['auto', 'auto'] as const },
    temperature: { title: 'Temperature Over Time', unit: '°C', domain: ['auto', 'auto'] as const },
    power: { title: 'Power Consumption Over Time', unit: ' W', domain: ['auto', 'auto'] as const },
    score: { title: 'Benchmark Score Over Time', unit: '', domain: ['auto', 'auto'] as const },
  }[metric];

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-800 rounded-lg bg-gray-900/30 text-gray-500">
        <p className="mb-2">No benchmark history available</p>
        <p className="text-xs text-gray-600">Run a benchmark to start tracking performance over time</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">{config.title}</h3>
          <p className="text-[10px] text-gray-500 uppercase mt-0.5">
            Showing {chartData.length} benchmark run{chartData.length !== 1 ? 's' : ''} • Unit: {config.unit.trim() || 'N/A'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          {gpuIds.slice(0, 6).map((gpuId, idx) => (
            <div key={gpuId} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="text-[10px] text-gray-400 uppercase">
                {gpuId.replace(/cloud-|gpu/gi, '').replace(/-/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.3} />
            <XAxis
              dataKey="label"
              stroke="#525252"
              tick={{ fontSize: 10, fill: "#737373" }}
              tickLine={false}
              axisLine={false}
              angle={-45}
              textAnchor="end"
              height={80}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#525252"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              domain={config.domain}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#f1f5f9"
              }}
              labelFormatter={(label) => `Time: ${label}`}
              formatter={(value: number, name: string) => [
                value !== null ? `${value.toFixed(1)}${config.unit}` : 'N/A',
                name.replace(/cloud-|gpu/gi, '').replace(/-/g, ' ')
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
              iconType="line"
            />
            {gpuIds.map((gpuId, idx) => (
              <Line
                key={gpuId}
                type="monotone"
                dataKey={gpuId}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
                connectNulls={true}
                name={gpuId.replace(/cloud-|gpu/gi, '').replace(/-/g, ' ')}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

