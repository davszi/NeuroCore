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
  month: string; // e.g., "2024-01", "2024-02"
  gpuId: string; // e.g., "cloud-243-gpu-0"
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
    // Group by month and GPU
    const monthMap: Record<string, Record<string, MonthlyBenchmarkData>> = {};
    
    data.forEach(item => {
      if (!monthMap[item.month]) {
        monthMap[item.month] = {};
      }
      monthMap[item.month][item.gpuId] = item;
    });

    // Convert to array format for Recharts
    const months = Object.keys(monthMap).sort();
    const gpuIds = Array.from(new Set(data.map(d => d.gpuId))).sort();

    return months.map(month => {
      const entry: any = { month };
      gpuIds.forEach(gpuId => {
        const item = monthMap[month]?.[gpuId];
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
    utilization: { title: 'GPU Utilization', unit: '%', domain: [0, 100] as [number, number] },
    memory: { title: 'Memory Usage', unit: ' GB', domain: ['auto', 'auto'] as const },
    temperature: { title: 'Temperature', unit: '°C', domain: ['auto', 'auto'] as const },
    power: { title: 'Power Consumption', unit: ' W', domain: ['auto', 'auto'] as const },
    score: { title: 'Benchmark Score', unit: '', domain: ['auto', 'auto'] as const },
  }[metric];

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-dashed border-gray-800 rounded-lg bg-gray-900/30 text-gray-500">
        <p>No monthly comparison data available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-2">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">{config.title}</h3>
          <p className="text-[10px] text-gray-500 uppercase mt-0.5">Unit: {config.unit.trim() || 'N/A'}</p>
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
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.3} />
            <XAxis 
              dataKey="month" 
              stroke="#525252"
              tick={{ fontSize: 10, fill: "#737373" }}
              tickLine={false}
              axisLine={false}
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
              formatter={(value: number) => [
                value !== null ? `${value.toFixed(1)}${config.unit}` : 'N/A',
                ''
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
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                name={gpuId.replace(/cloud-|gpu/gi, '').replace(/-/g, ' ')}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

