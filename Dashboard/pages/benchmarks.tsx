import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { ClusterState, AttentionMetricsResponse, MetricEntry, TrainingJobConfig } from "@/types/cluster";

import GpuMemoryBarChart from "../components/benchmarks/GpuMemoryBarChart";
import RamUsageBarChart from "../components/benchmarks/RamUsageBarChart";
import PerplexityChart from "../components/benchmarks/PerplexityChart";
import RuntimePerEpochChart from "../components/benchmarks/RuntimePerEpochChart";
import MLBenchmarkChart from "../components/benchmarks/MLBenchmarkChart";
import RunConfigurationsTable from "../components/benchmarks/RunConfigurationsTable";
import NewRunModal from "@/components/benchmarks/NewRunModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --- Types ---
interface BenchmarkDataPoint {
  timestamp: number;
  label: string;
  utilization: number;
  temp?: number;
  mem?: number;
  fan?: number;
  efficiency?: number;
  [key: string]: number | string | undefined;
}

interface AggregatedPoint extends BenchmarkDataPoint {
  count: number;
}

// --- Helpers ---
function smoothLine(data: BenchmarkDataPoint[], window = 3): BenchmarkDataPoint[] {
  if (!data.length) return data;
  return data.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = (getter: (p: BenchmarkDataPoint) => number | undefined) => {
      const values = slice.map(getter).filter((v): v is number => v !== undefined);
      if (values.length === 0) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    return {
      ...point,
      utilization: avg(p => p.utilization),
      temp: point.temp !== undefined ? avg(p => p.temp) : undefined,
      mem: point.mem !== undefined ? avg(p => p.mem) : undefined,
      fan: point.fan !== undefined ? avg(p => p.fan) : undefined,
      efficiency: point.efficiency !== undefined ? avg(p => p.efficiency) : undefined,
    };
  });
}

function getRangeLabel(date: Date, range: string) {
  if (range === "today") return date.getHours() + ":00";
  if (range === "7d") return date.toLocaleDateString(undefined, { weekday: "short" });
  if (range === "month") return date.getDate() + "/" + (date.getMonth() + 1);
  if (range === "1y") return date.toLocaleDateString(undefined, { month: "short" });
  return "";
}

// --------------------- Main Page ---------------------
export default function BenchmarksPage() {
  const { data: snapshots = [], isLoading } = useSWR<ClusterState[]>("/api/node-history", fetcher, {
    refreshInterval: 60000, 
  });

  const { data: attentionMetrics } = useSWR<AttentionMetricsResponse>("/api/attention-metrics", fetcher);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<"cluster" | "ml">("cluster");
  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");
  const [smoothEnabled, setSmoothEnabled] = useState(true);
  
  // --- Training Modal State ---
  const [isModalOpen, setModalOpen] = useState(false);
  const [isStarting, setStarting] = useState(false);

  const handleStartTraining = async (config: TrainingJobConfig, nodeName: string) => {
    setStarting(true);
    try {
      const res = await fetch('/api/start-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, nodeName })
      });
      if (!res.ok) throw new Error("Failed to start");
      alert("Training started successfully! Check the dashboard for progress.");
      setModalOpen(false);
    } catch (e) {
      alert("Error starting training: " + e);
    } finally {
      setStarting(false);
    }
  };

  const ranges: ("today" | "7d" | "month" | "1y")[] = ["today", "7d", "month", "1y"];

  // --- Data Processing (Cluster History) ---
  const perGpuSeries = useMemo(() => {
    if (!snapshots || !snapshots.length) return [];
    const now = new Date();
    const map: Record<string, BenchmarkDataPoint[]> = {};

    snapshots.forEach((snap) => {
      const ts = new Date(snap.last_updated_timestamp).getTime();
      const snapDate = new Date(ts);
      let include = false;
      const diffTime = now.getTime() - ts;
      const oneDay = 24 * 60 * 60 * 1000;

      if (range === "today") include = diffTime < oneDay;
      if (range === "7d") include = diffTime < 7 * oneDay;
      if (range === "month") include = diffTime < 30 * oneDay;
      if (range === "1y") include = diffTime < 365 * oneDay;
      
      if (!include) return;

      snap.gpu_nodes.forEach((node) => {
        node.gpus.forEach((gpu) => {
          const key = `${node.node_name} - ${gpu.gpu_name} (ID: ${gpu.gpu_id})`;
          if (!map[key]) map[key] = [];
          
          const efficiency = (gpu.utilization_percent > 0 && (gpu.power_draw_watts || 0) > 0)
            ? gpu.utilization_percent / (gpu.power_draw_watts || 1)
            : 0;

          map[key].push({
            timestamp: ts,
            utilization: gpu.utilization_percent,
            temp: gpu.temperature_celsius,
            mem: gpu.memory_used_mib ? gpu.memory_used_mib / 1024 : 0, 
            fan: gpu.fan_speed_percent,
            efficiency,
            label: getRangeLabel(snapDate, range),
          });
        });
      });
    });

    return Object.entries(map).map(([name, data]) => {
      const tempMap: Record<string, AggregatedPoint> = {};
      data.forEach((p) => {
        if (!tempMap[p.label]) {
          tempMap[p.label] = { ...p, count: 1 };
        } else {
          const target = tempMap[p.label];
          target.utilization += p.utilization;
          if(p.temp !== undefined && target.temp !== undefined) target.temp += p.temp;
          if(p.mem !== undefined && target.mem !== undefined) target.mem += p.mem;
          if(p.efficiency !== undefined && target.efficiency !== undefined) target.efficiency += p.efficiency;
          target.count += 1;
        }
      });

      let aggregated: BenchmarkDataPoint[] = Object.values(tempMap).map((val: AggregatedPoint) => ({
        timestamp: val.timestamp,
        label: val.label,
        utilization: val.utilization / val.count,
        temp: val.temp !== undefined ? val.temp / val.count : undefined,
        mem: val.mem !== undefined ? val.mem / val.count : undefined,
        fan: val.fan !== undefined ? val.fan / val.count : undefined,
        efficiency: val.efficiency !== undefined ? val.efficiency / val.count : undefined,
      }));

      aggregated.sort((a, b) => a.timestamp - b.timestamp);
      if (smoothEnabled) aggregated = smoothLine(aggregated);
      return { name, data: aggregated };
    });
  }, [snapshots, range, smoothEnabled]);

  const totalPower = useMemo(() => {
    if (!snapshots.length) return 0;
    const sum = snapshots.reduce((acc, s) => acc + (s.total_power_consumption_watts || 0), 0);
    return Math.round(sum / snapshots.length);
  }, [snapshots]);

  const avgGpuUtil = useMemo(() => {
    let totalUtil = 0;
    let count = 0;
    snapshots.forEach((snap) => snap.gpu_nodes.forEach((node) => node.gpus.forEach((g) => {
        totalUtil += g.utilization_percent || 0;
        count++;
    })));
    return count ? Math.round((totalUtil / count) * 10) / 10 : 0;
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
    if (util >= 90) return { text: "Heavy Load", color: "text-red-400", bg: "bg-red-900/30" };
    if (util >= 50) return { text: "Moderate", color: "text-yellow-300", bg: "bg-yellow-900/20" };
    return { text: "Idle / Healthy", color: "text-green-400", bg: "bg-green-900/20" };
  }

  return (
    <div className="p-6 space-y-6 min-h-screen">
      
      {/* --- Top Header & Tabs --- */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-800">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Benchmarks</h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time hardware performance vs. ML Model training metrics.
          </p>
        </div>

        <div className="flex bg-gray-900 p-1.5 rounded-lg border border-gray-700">
          <button
            onClick={() => setActiveTab("cluster")}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "cluster"
                ? "bg-gray-800 text-white shadow-sm border border-gray-600"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Cluster Health
          </button>
          <button
            onClick={() => setActiveTab("ml")}
            className={`px-6 py-2 rounded-md text-sm font-semibold transition-all ${
              activeTab === "ml"
                ? "bg-cyan-900/40 text-cyan-100 border border-cyan-700/50 shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            ML Benchmarks
          </button>
        </div>
      </header>

      {/* ================= CLUSTER HEALTH TAB ================= */}
      {activeTab === "cluster" && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          
          {/* Controls */}
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-3 bg-gray-900 p-2 rounded-lg border border-gray-700">
              <div className="inline-flex rounded-md bg-gray-800 p-1">
                {ranges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                      range === r ? "bg-cyan-600 text-white shadow" : "text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}
                  >
                    {r === "today" ? "Today" : r === "7d" ? "7 Days" : r === "month" ? "Month" : "Year"}
                  </button>
                ))}
              </div>
              <div className="h-6 w-px bg-gray-700 mx-1"></div>
              <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={smoothEnabled} 
                  onChange={() => setSmoothEnabled(!smoothEnabled)} 
                  className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-offset-gray-900"
                />
                Smooth
              </label>
            </div>
          </div>

          {/* KPI Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard title="Avg Power Draw (W)" value={totalPower} color="cyan" />
            <SummaryCard title="Avg GPU Utilization (%)" value={avgGpuUtil} color="green" />
            <SummaryCard title="Peak Memory Usage (GB)" value={peakMemory} color="yellow" />
          </section>

          {/* History Charts */}
          <section className="space-y-6">
            {isLoading && snapshots.length === 0 && (
                <div className="flex justify-center py-20">
                    <span className="text-cyan-500 animate-pulse">Loading history data...</span>
                </div>
            )}

            {!isLoading && perGpuSeries.length === 0 ? (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-10 text-center text-gray-400">
                <p>No history data found for this time range.</p>
                <p className="text-xs mt-2 text-gray-500">Wait for the background worker to save the first snapshot (approx 5 mins).</p>
              </div>
            ) : (
              perGpuSeries.map(({ name, data }) => {
                const latest = data[data.length - 1] || { utilization: 0, efficiency: 0 };
                const hb = healthBadge(latest.utilization);
                return (
                  <motion.div
                    key={name}
                    className="bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-white font-semibold text-lg">{name}</h3>
                        <span className={`${hb.bg} ${hb.color} px-2 py-0.5 rounded text-xs font-medium border border-white/5`}>
                            {hb.text}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Latest Util</div>
                        <div className="text-xl font-bold text-white font-mono">
                          {latest.utilization.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                          <XAxis 
                            dataKey="label" 
                            stroke="#9CA3AF" 
                            tick={{fontSize: 12}} 
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                          />
                          <YAxis 
                            stroke="#9CA3AF" 
                            tick={{fontSize: 12}} 
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', color: '#F3F4F6' }}
                            itemStyle={{ padding: 0 }}
                            labelStyle={{ color: '#9CA3AF', marginBottom: '0.5rem' }}
                            formatter={(val: number, key: string) => {
                              if(key === "utilization") return [val.toFixed(1) + "%", "GPU Util"];
                              if(key === "temp") return [val.toFixed(1) + "°C", "Temp"];
                              if(key === "mem") return [val.toFixed(1) + " GB", "VRAM"];
                              return [val, key];
                            }}
                          />
                          <Line type="monotone" dataKey="utilization" stroke="#06b6d4" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="temp" stroke="#f87171" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                          <Line type="monotone" dataKey="mem" stroke="#a3e635" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="flex justify-center gap-6 mt-2">
                        <LegendItem color="bg-cyan-500" label="GPU Util" />
                        <LegendItem color="bg-red-400" label="Temp (°C)" />
                        <LegendItem color="bg-lime-400" label="VRAM (GB)" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </section>
        </motion.div>
      )}

      {/* ================= ML BENCHMARKS TAB ================= */}
      {activeTab === "ml" && attentionMetrics && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Attention Mechanism Comparison</h2>
            <button 
              onClick={() => setModalOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-lg shadow-cyan-900/20 flex items-center gap-2"
            >
              <span className="text-xl leading-none mb-0.5">+</span> New Run
            </button>
          </div>

          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <RunConfigurationsTable />
              </div>

              <div className="lg:col-span-2">
                <motion.div
                  className="bg-gray-900 border border-gray-700 rounded-lg p-6 h-full"
                >
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Training Loss Comparison
                  </h3>
                  <div className="h-80">
                    <MLBenchmarkChart
                      baselineData={(attentionMetrics.sdpa?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
                      flashData={(attentionMetrics.flash?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
                    />
                  </div>
                </motion.div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <motion.div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">GPU Memory Usage</h3>
                <p className="text-xs text-gray-500 mb-4">(Total: 94 GB per GPU)</p>
                <GpuMemoryBarChart
                  sdpaData={attentionMetrics.sdpa?.data || []}
                  flashData={attentionMetrics.flash?.data || []}
                />
              </motion.div>

              <motion.div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">RAM Usage</h3>
                <p className="text-xs text-gray-500 mb-4">(Total: 1100 GB)</p>
                <RamUsageBarChart
                  sdpaData={attentionMetrics.sdpa?.data || []}
                  flashData={attentionMetrics.flash?.data || []}
                />
              </motion.div>
            </div>

            <motion.div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-blue-300 font-semibold mb-1">Key Insight</h4>
                  <p className="text-gray-300 text-sm">
                    Both Flash Attention and SDPA Attention consume almost identical GPU Memory and RAM. 
                    This tells us that performance differences come from <span className="text-blue-400 font-medium">algorithmic speed</span>, not memory usage.
                  </p>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <motion.div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Perplexity Evolution</h3>
                <div className="h-64">
                  <PerplexityChart
                    sdpaData={attentionMetrics.sdpa?.data || []}
                    flashData={attentionMetrics.flash?.data || []}
                  />
                </div>
              </motion.div>

              <motion.div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-2">Runtime per Epoch (seconds)</h3>
                <div className="text-sm text-gray-400 mb-4 space-y-1">
                  <p className="italic">Time taken to complete each training epoch.</p>
                  <p className="text-xs text-gray-500"><span className="text-yellow-400">Note:</span> Epoch 0 includes initial setup.</p>
                </div>
                <div className="h-64">
                  <RuntimePerEpochChart
                    sdpaRuntime={attentionMetrics.sdpa?.runtimePerEpoch || []}
                    flashRuntime={attentionMetrics.flash?.runtimePerEpoch || []}
                  />
                </div>
              </motion.div>
            </div>
          </section>
        </motion.div>
      )}

      {/* --- Global Modal --- */}
      <NewRunModal 
        isOpen={isModalOpen} 
        onClose={() => setModalOpen(false)} 
        onStart={handleStartTraining}
        isLoading={isStarting}
      />
    </div>
  );
}

function SummaryCard({ title, value, color }: { title: string; value: number | string; color: "cyan" | "green" | "yellow" }) {
  const colorStyles: Record<string, string> = {
    cyan: "text-cyan-400 border-cyan-900/30 bg-cyan-900/10",
    green: "text-green-400 border-green-900/30 bg-green-900/10",
    yellow: "text-yellow-400 border-yellow-900/30 bg-yellow-900/10",
  };
  return (
    <div className={`border rounded-lg p-4 ${colorStyles[color]}`}>
      <div className="text-xs uppercase tracking-wider opacity-80">{title}</div>
      <div className="text-3xl font-bold mt-1 font-mono">{value}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-3 h-1 rounded-full ${color}`}></span>
            {label}
        </div>
    )
}