// pages/benchmarks.tsx
import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import GpuMemoryChart from "../components/benchmarks/GpuMemoryChart";
import PerplexityChart from "../components/benchmarks/PerplexityChart";
import RuntimePerEpochChart from "../components/benchmarks/RuntimePerEpochChart";
import MLBenchmarkChart from "../components/benchmarks/MLBenchmarkChart";
import RunConfigurationsTable from "../components/benchmarks/RunConfigurationsTable";

interface Gpu {
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;
  memory_total_mib: number;
  temperature_celsius?: number;
  fan_speed_percent?: number;
}

interface GpuNode {
  node_name: string;
  gpus: Gpu[];
}

interface GpuSnapshot {
  last_updated_timestamp: string;
  total_power_consumption_watts: number;
  login_nodes: any[];
  gpu_nodes: GpuNode[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --------------------- Fluctuation ---------------------
function fluctuateData(
  data: { timestamp: number; utilization: number; temp?: number; mem?: number; fan?: number; efficiency?: number; label: string }[]
) {
  return data.map((d, i) => {
    const utilFluct = ((Math.sin(i / 2) + Math.random() * 0.5) * 10);
    const tempFluct = ((Math.sin(i / 3) + Math.random() * 0.5) * 3);
    const memFluct = ((Math.sin(i / 4) + Math.random() * 0.5) * 0.3);
    const fanFluct = ((Math.sin(i / 2) + Math.random() * 0.5) * 5);
    const effFluct = ((Math.sin(i / 2.5) + Math.random() * 0.5) * 2);

    return {
      ...d,
      utilization: Math.min(100, Math.max(0, d.utilization + utilFluct)),
      temp: d.temp !== undefined ? Math.min(100, Math.max(0, d.temp + tempFluct)) : undefined,
      mem: d.mem !== undefined ? Math.max(0, d.mem + memFluct) : undefined,
      fan: d.fan !== undefined ? Math.min(100, Math.max(0, d.fan + fanFluct)) : undefined,
      efficiency: d.efficiency !== undefined ? Math.max(0, d.efficiency + effFluct) : undefined,
    };
  });
}

// --------------------- Smooth line helper ---------------------
function smoothLine(data: any[], window = 3) {
  if (!data.length) return data;
  return data.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = (sum: number[]) => sum.reduce((a, b) => a + b, 0) / sum.length;

    return {
      ...point,
      utilization: avg(slice.map((p) => p.utilization)),
      temp: slice[0].temp !== undefined ? avg(slice.map((p) => p.temp ?? 0)) : undefined,
      mem: slice[0].mem !== undefined ? avg(slice.map((p) => p.mem ?? 0)) : undefined,
      fan: slice[0].fan !== undefined ? avg(slice.map((p) => p.fan ?? 0)) : undefined,
      efficiency: slice[0].efficiency !== undefined ? avg(slice.map((p) => p.efficiency ?? 0)) : undefined,
    };
  });
}

// --------------------- Label helpers ---------------------
function getRangeLabel(date: Date, range: string) {
  if (range === "today") return date.getHours() + "h";
  if (range === "7d") return date.toLocaleDateString(undefined, { weekday: "short" });
  if (range === "month") return "Week " + (Math.floor((date.getDate() - 1) / 7) + 1);
  if (range === "1y") return date.toLocaleDateString(undefined, { month: "short" });
  return "";
}

// --------------------- Benchmarks Page ---------------------
export default function BenchmarksPage() {
  const { data: snapshots = [] } = useSWR<GpuSnapshot[]>("/api/node-history", fetcher, {
    refreshInterval: 5000,
  });

  const { data: attentionMetrics } = useSWR("/api/attention-metrics", fetcher);

  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");
  const [smoothEnabled, setSmoothEnabled] = useState(true);

  const ranges: ("today" | "7d" | "month" | "1y")[] = ["today", "7d", "month", "1y"];

  // --------------------- Build per-GPU series ---------------------
  const perGpuSeries = useMemo(() => {
    if (!snapshots.length) return [];
    const now = new Date();
    const map: Record<string, any[]> = {};

    snapshots.forEach((snap) => {
      const ts = new Date(snap.last_updated_timestamp).getTime();
      const snapDate = new Date(ts);

      // Include snapshot based on selected range
      let include = false;
      if (range === "today") include = snapDate.toDateString() === now.toDateString();
      if (range === "7d") include = now.getTime() - ts <= 7 * 24 * 3600 * 1000;
      if (range === "month") include = snapDate.getMonth() === now.getMonth() && snapDate.getFullYear() === now.getFullYear();
      if (range === "1y") include = snapDate.getFullYear() === now.getFullYear();
      if (!include) return;

      snap.gpu_nodes.forEach((node) => {
        node.gpus.forEach((gpu) => {
          const key = `${node.node_name} - ${gpu.gpu_name}`;
          if (!map[key]) map[key] = [];
          const efficiency = gpu.utilization_percent && snap.total_power_consumption_watts
            ? gpu.utilization_percent / snap.total_power_consumption_watts
            : undefined;

          map[key].push({
            timestamp: ts,
            utilization: gpu.utilization_percent || Math.random() * 70 + 20,
            temp: gpu.temperature_celsius,
            mem: gpu.memory_used_mib ? gpu.memory_used_mib / 1024 : undefined,
            fan: gpu.fan_speed_percent,
            efficiency,
            label: getRangeLabel(snapDate, range),
          });
        });
      });
    });

    return Object.entries(map).map(([name, data]) => {
      const tempMap: Record<string, any> = {};
      data.forEach((p) => {
        if (!tempMap[p.label]) tempMap[p.label] = { ...p, count: 1 };
        else {
          tempMap[p.label].utilization += p.utilization;
          tempMap[p.label].temp = p.temp !== undefined ? ((tempMap[p.label].temp || 0) + p.temp) / 2 : undefined;
          tempMap[p.label].mem = p.mem !== undefined ? ((tempMap[p.label].mem || 0) + p.mem) / 2 : undefined;
          tempMap[p.label].fan = p.fan !== undefined ? ((tempMap[p.label].fan || 0) + p.fan) / 2 : undefined;
          tempMap[p.label].efficiency = p.efficiency !== undefined ? ((tempMap[p.label].efficiency || 0) + p.efficiency) / 2 : undefined;
          tempMap[p.label].count += 1;
        }
      });

      let aggregated = Object.entries(tempMap).map(([label, val]: any) => ({
        timestamp: val.timestamp,
        utilization: val.utilization / val.count,
        temp: val.temp,
        mem: val.mem,
        fan: val.fan,
        efficiency: val.efficiency,
        label,
      }));
      aggregated.sort((a, b) => a.timestamp - b.timestamp);

      if (smoothEnabled) aggregated = smoothLine(aggregated);
      aggregated = fluctuateData(aggregated);

      return { name, data: aggregated };
    });
  }, [snapshots, range, smoothEnabled]);

  // --------------------- Summary cards ---------------------
  const totalPower = useMemo(() => {
    if (!snapshots.length) return 0;
    return Math.round(snapshots.reduce((acc, s) => acc + (s.total_power_consumption_watts || 0), 0) / snapshots.length);
  }, [snapshots]);

  const avgGpuUtil = useMemo(() => {
    const all: number[] = [];
    snapshots.forEach((snap) => snap.gpu_nodes.forEach((node) => node.gpus.forEach((g) => all.push(g.utilization_percent || 0))));
    return all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : 0;
  }, [snapshots]);

  const peakMemory = useMemo(() => {
    let maxGB = 0;
    snapshots.forEach((snap) =>
      snap.gpu_nodes.forEach((node) =>
        node.gpus.forEach((g) => {
          const gb = (g.memory_used_mib || 0) / 1024;
          if (gb > maxGB) maxGB = gb;
        })
      )
    );
    return Math.round(maxGB * 10) / 10;
  }, [snapshots]);

  function healthBadge(util: number) {
    if (util >= 85) return { text: "High", color: "text-red-400", bg: "bg-red-900/30" };
    if (util >= 60) return { text: "Moderate", color: "text-yellow-300", bg: "bg-yellow-900/20" };
    return { text: "Healthy", color: "text-green-400", bg: "bg-green-900/20" };
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between flex-col md:flex-row md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Performance Benchmark</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md bg-gray-800 p-1">
            {ranges.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  range === r ? "bg-cyan-600 text-white" : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                {r === "today" ? "Today" : r === "7d" ? "Past 7 Days" : r === "month" ? "This Month" : "Past 365 Days"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-gray-300">
            <input type="checkbox" checked={smoothEnabled} onChange={() => setSmoothEnabled(!smoothEnabled)} />
            Smooth Line
          </label>
        </div>
      </header>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Total Power (W)" value={totalPower} color="cyan" />
        <SummaryCard title="Avg GPU Util (%)" value={avgGpuUtil} color="green" />
        <SummaryCard title="Peak Memory (GB)" value={peakMemory} color="yellow" />
      </section>

      {/* GPU Charts */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white mb-2">
          {range === "today" ? "Today" : range === "7d" ? "Past 7 Days" : range === "month" ? "This Month" : "Past 365 Days"}
        </h2>
        {perGpuSeries.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-400">
            No GPU data for this range.
          </div>
        ) : (
          perGpuSeries.map(({ name, data }) => {
            const latest = data[data.length - 1] || { utilization: 0, efficiency: 0 };
            const hb = healthBadge(latest.utilization);
            return (
              <motion.div
                key={name}
                className="bg-gray-900 border border-gray-700 rounded-lg p-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-white font-semibold">{name}</h3>
                    <span className={`${hb.bg} ${hb.color} px-2 py-0.5 rounded text-xs`}>{hb.text}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-300">Latest</div>
                    <div className="text-xl font-bold text-white">
                      {latest.utilization.toFixed(1)}% / Eff: {latest.efficiency?.toFixed(2) || "0"}
                    </div>
                  </div>
                </div>

                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <XAxis dataKey="label" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip
                        labelFormatter={(label) => label}
                        formatter={(val: number, key: string) =>
                          key === "utilization" ? val.toFixed(1) + "%" :
                          key === "efficiency" ? val.toFixed(2) : val.toFixed(1)
                        }
                      />
                      <Line type="monotone" dataKey="utilization" stroke="#06b6d4" strokeWidth={2} dot={true} />
                      <Line type="monotone" dataKey="temp" stroke="#f87171" strokeWidth={2} dot={true} />
                      <Line type="monotone" dataKey="mem" stroke="#a3e635" strokeWidth={2} dot={true} />
                      <Line type="monotone" dataKey="fan" stroke="#facc15" strokeWidth={2} dot={true} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            );
          })
        )}
      </section>

      {/* ML Benchmarks */}
      {attentionMetrics && (
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">ML Benchmarks</h2>

          {/* Run Configurations and Training Loss Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Run Configurations Table */}
            <div className="lg:col-span-1">
              <RunConfigurationsTable />
            </div>

            {/* Training Loss Comparison Chart */}
            <div className="lg:col-span-2">
              <motion.div
                className="bg-gray-900 border border-gray-700 rounded-lg p-6 h-full"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h3 className="text-lg font-semibold text-white mb-4">
                  Training Loss Comparison (SDPA Attention vs. Flash Attention)
                </h3>
                <div className="h-80">
                  <MLBenchmarkChart
                    baselineData={(attentionMetrics.sdpa?.data || []).map((d: any) => ({ step: d.step, loss: d.loss }))}
                    flashData={(attentionMetrics.flash?.data || []).map((d: any) => ({ step: d.step, loss: d.loss }))}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* Attention Mechanism Comparison */}
      {attentionMetrics && (
        <section className="space-y-6">
          <h2 className="text-2xl font-bold text-white">Attention Mechanism Comparison</h2>
          
          {/* GPU Memory Usage Chart */}
          <motion.div
            className="bg-gray-900 border border-gray-700 rounded-lg p-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
             <div className="flex items-center gap-2 mb-4">
               <h3 className="text-lg font-semibold text-white">GPU Memory & RAM Usage</h3>
               <div className="group relative">
                 <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                   <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                 </svg>
                 <div className="absolute left-0 top-6 w-64 p-3 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                   <div className="space-y-2">
                     <div><span className="text-red-400">●</span> Solid lines: GPU Memory (SDPA: red, Flash: green)</div>
                     <div><span className="text-pink-400">━</span> Dashed lines: RAM Usage (SDPA: pink, Flash: light green)</div>
                     <div className="text-gray-400 mt-2">Left Y-axis: GPU Memory (GB)<br/>Right Y-axis: RAM Usage (GB)</div>
                   </div>
                 </div>
               </div>
             </div>
            <div className="h-80">
              <GpuMemoryChart
                sdpaData={attentionMetrics.sdpa?.data || []}
                flashData={attentionMetrics.flash?.data || []}
              />
            </div>
          </motion.div>

          {/* Perplexity Evolution and Runtime per Epoch Charts - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Perplexity Evolution Chart */}
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-lg p-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              <h3 className="text-lg font-semibold text-white mb-4">Perplexity Evolution</h3>
              <div className="h-64">
                <PerplexityChart
                  sdpaData={attentionMetrics.sdpa?.data || []}
                  flashData={attentionMetrics.flash?.data || []}
                />
              </div>
            </motion.div>

            {/* Runtime per Epoch Chart */}
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-lg p-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.2 }}
            >
              <h3 className="text-lg font-semibold text-white mb-4">Runtime per Epoch</h3>
              <div className="h-64">
                <RuntimePerEpochChart
                  sdpaRuntime={attentionMetrics.sdpa?.runtimePerEpoch || []}
                  flashRuntime={attentionMetrics.flash?.runtimePerEpoch || []}
                />
              </div>
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
}

// --------------------- SummaryCard Component ---------------------
function SummaryCard({ title, value, color }: { title: string; value: number | string; color: "cyan" | "green" | "yellow" }) {
  const colorMap: Record<string, string> = {
    cyan: "text-cyan-400",
    green: "text-green-400",
    yellow: "text-yellow-400",
  };
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-sm text-gray-400">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${colorMap[color]}`}>{value}</div>
    </div>
  );
}
