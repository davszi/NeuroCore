import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
    benchmark_score?: number;
  };
}

interface Props {
  data: MonthlyBenchmarkData[];
  metric: 'utilization' | 'memory' | 'temperature' | 'power' | 'score';
}

export default function MonthlyComparisonChart({ data, metric }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const chartData = useMemo(() => {
    const sortedData = [...data].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    const timestampMap: Record<string, Record<string, MonthlyBenchmarkData>> = {};

    sortedData.forEach(item => {
      const key = item.timestamp || item.month;
      if (!timestampMap[key]) {
        timestampMap[key] = {};
      }
      timestampMap[key][item.gpuId] = item;
    });

    const timestamps = Object.keys(timestampMap).sort();
    const gpuIds = Array.from(new Set(data.map(d => d.gpuId))).sort();

    return timestamps.map(ts => {
      const entry: any = {
        timestamp: ts,
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
    "#3b82f6", "#ef4444", "#fbbf24", "#10b981", "#8b5cf6", "#f97316", "#06b6d4",
    "#ec4899", "#6366f1", "#14b8a6", "#f59e0b", "#84cc16", "#d946ef", "#0ea5e9",
    "#f43f5e", "#22c55e", "#a855f7", "#64748b", "#cbd5e1", "#475569",
    "#94a3b8", "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#4ade80", "#2dd4bf",
    "#22d3ee", "#38bdf8", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6",
    "#fb7185", "#57534e", "#a8a29e", "#d6d3d1", "#e7e5e4", "#f5f5f4"
  ];

  const gpuIds = Array.from(new Set(data.map(d => d.gpuId))).sort();

  // Group GPU IDs by node for the legend
  const groupedKeys = useMemo(() => {
    const groups: Record<string, string[]> = {};
    gpuIds.forEach(id => {
      // Robustly extract node name: cloud-243-gpu-0 or cloud-243-0 -> cloud-243
      const parts = id.split('-');
      let nodeName = id;
      if (parts[0] === 'cloud' && parts[1]) {
        nodeName = `cloud-${parts[1]}`;
      } else if (parts.length > 1) {
        nodeName = parts.slice(0, parts.length - 1).join('-');
      }

      if (!groups[nodeName]) groups[nodeName] = [];
      groups[nodeName].push(id);
    });

    // Natural sort nodes
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    );
  }, [gpuIds]);

  const toggleKey = (key: string) => {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleNode = (nodeName: string) => {
    const keys = groupedKeys[nodeName];
    const allHidden = keys.every(k => hiddenKeys.has(k));
    setHiddenKeys(prev => {
      const next = new Set(prev);
      keys.forEach(k => {
        if (allHidden) next.delete(k);
        else next.add(k);
      });
      return next;
    });
  };

  const config = {
    utilization: { title: 'GPU Utilization Historical', unit: '%', domain: [0, 100] as [number, number] },
    memory: { title: 'VRAM Usage Historical', unit: ' GB', domain: ['auto', 'auto'] as const },
    temperature: { title: 'Temperature Historical', unit: '°C', domain: ['auto', 'auto'] as const },
    power: { title: 'Power Consumption Historical', unit: ' W', domain: ['auto', 'auto'] as const },
    score: { title: 'Benchmark Score Historical', unit: '', domain: ['auto', 'auto'] as const },
  }[metric];

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-800 rounded-lg bg-gray-900/30 text-gray-500">
        <p className="mb-2">No benchmark history available</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1117] border border-gray-800/40 rounded-xl overflow-hidden p-6 shadow-2xl flex flex-col h-[480px]">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h3 className="text-xs font-bold text-gray-200 tracking-wider uppercase">{config.title}</h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5 uppercase tracking-widest">UNIT: {config.unit}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1.5 max-w-[70%]">
          {Object.entries(groupedKeys).map(([nodeName, keys]) => (
            <div
              key={nodeName}
              className="flex items-center gap-1.5 cursor-pointer group"
              onClick={() => toggleNode(nodeName)}
              onMouseEnter={() => setHoveredKey(nodeName)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <span className="text-[8px] font-bold text-gray-500 group-hover:text-white transition-colors uppercase tracking-[0.1em]">
                {nodeName.replace('cloud-', 'NODE ')}
              </span>
              <div className="flex gap-0.5">
                {keys.map((key) => {
                  const idx = gpuIds.indexOf(key);
                  const isHidden = hiddenKeys.has(key);
                  return (
                    <div
                      key={key}
                      className={`w-3.5 h-1 rounded-sm transition-all ${isHidden ? 'bg-gray-800/50' : ''}`}
                      style={{ backgroundColor: isHidden ? undefined : colors[idx % colors.length] }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} opacity={0.03} />
            <XAxis
              dataKey="label"
              stroke="#4b5563"
              tick={{ fontSize: 9, fill: "#4b5563" }}
              tickLine={false}
              axisLine={false}
              dy={10}
              interval="preserveStart"
            />
            <YAxis
              stroke="#4b5563"
              tick={{ fontSize: 9, fill: "#4b5563" }}
              tickLine={false}
              axisLine={false}
              domain={config.domain}
              width={45}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: "#0f1117",
                borderColor: "#1f2937",
                borderRadius: "8px",
                fontSize: "10px",
                color: "#f3f4f6",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                padding: "8px 12px"
              }}
              labelFormatter={(label) => label}
              formatter={(value: number, name: string, props: any) => [
                <div className="flex items-center gap-2" key={name}>
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: props.color }}
                  />
                  <span className="text-gray-400 uppercase text-[9px] tracking-wider">{name}</span>
                  <span className="font-bold text-white ml-auto">{value !== null ? `${value.toFixed(1)}${config.unit}` : 'OFFLINE'}</span>
                </div>,
                null
              ]}
            />
            {gpuIds.map((gpuId, idx) => {
              const isHidden = hiddenKeys.has(gpuId);
              if (isHidden) return null;
              const isHighlighted = !hoveredKey || gpuId === hoveredKey || gpuId.startsWith(hoveredKey + '-');

              return (
                <Area
                  key={gpuId}
                  type="monotone"
                  dataKey={gpuId}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={isHighlighted ? 3 : 1.5}
                  fill="transparent"
                  strokeOpacity={isHighlighted ? 1 : 0.5}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: colors[idx % colors.length] }}
                  connectNulls={true}
                  name={gpuId.replace('cloud-', 'NODE ').replace('-gpu-', ' GPU ')}
                  animationDuration={500}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
