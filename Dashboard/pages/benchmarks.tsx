import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/router";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  ClusterState,
  AttentionMetricsResponse,
  TrainingJobConfig,
  MetricEntry
} from "@/types/cluster";

import GpuMemoryBarChart from "../components/benchmarks/GpuMemoryBarChart";
import RamUsageBarChart from "../components/benchmarks/RamUsageBarChart";
import PerplexityChart from "../components/benchmarks/PerplexityChart";
import RuntimePerEpochChart from "../components/benchmarks/RuntimePerEpochChart";
import MLBenchmarkChart from "../components/benchmarks/MLBenchmarkChart";
import RunConfigurationsTable from "../components/benchmarks/RunConfigurationsTable";
import NewRunModal from "@/components/benchmarks/NewRunModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BenchmarkDataPoint {
  timestamp: number;
  label: string;
  [key: string]: number | string | undefined;
}

interface NodeData {
  id: string;
  name: string;
  data: BenchmarkDataPoint[];
}

function formattedDate(ts: number, range: string) {
  const date = new Date(ts);
  if (range === "today") return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === "7d") return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function inRange(ts: number, range: "today" | "7d" | "month" | "1y") {
  const date = new Date(ts);
  const now = new Date();
  if (isNaN(date.getTime())) return false;

  switch (range) {
    case "today":
      return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case "7d": {
      const diff = now.getTime() - ts;
      return diff <= 7 * 24 * 60 * 60 * 1000;
    }
    case "month":
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    case "1y":
      return date.getFullYear() === now.getFullYear();
    default:
      return true;
  }
}

export default function BenchmarksPage() {
  const router = useRouter();
  
  // Data Fetching
  const { data: snapshots = [], isLoading: isHistoryLoading } = useSWR<ClusterState[]>("/api/node-history", fetcher, { refreshInterval: 60000 });
  const { data: attentionMetrics, isLoading: isMlLoading } = useSWR<AttentionMetricsResponse>("/api/attention-metrics", fetcher);

  // State
  const [activeTab, setActiveTab] = useState<"performance" | "ml">("performance");
  const [perfSubTab, setPerfSubTab] = useState<"parameter" | "node">("parameter");
  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");
  
  const [isModalOpen, setModalOpen] = useState(false);
  const [isStarting, setStarting] = useState(false);
  const [activeRun, setActiveRun] = useState<{ pid: string, node: string } | null>(null);
  const [isCanceling, setCanceling] = useState(false);

  const ranges = ["today", "7d", "month", "1y"] as const;

  // --- Handlers ---
  const handleStartTraining = async (config: TrainingJobConfig, nodeName: string) => {
    setStarting(true);
    try {
      const res = await fetch('/api/start-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, nodeName }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      
      const runInfo = { pid: data.pid, node: nodeName };
      setActiveRun(runInfo);
      localStorage.setItem("activeRun", JSON.stringify(runInfo)); // Save state

      alert(`Training started! PID: ${data.pid}`);
      setModalOpen(false);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setStarting(false);
    }
  };

  const handleCancelTraining = async () => {
    if (!activeRun) return;
    if (!confirm(`Stop training (PID ${activeRun.pid})?`)) return;

    setCanceling(true);
    try {
      const res = await fetch('/api/cancel-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: activeRun.pid, nodeName: activeRun.node }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      alert("Training stopped successfully.");
      setActiveRun(null);
      localStorage.removeItem("activeRun"); // Clear state
    } catch (e: any) {
      alert("Failed to stop: " + e.message);
    } finally {
      setCanceling(false);
    }
  };

  // Restore active run on mount
  useEffect(() => {
    const saved = localStorage.getItem("activeRun");
    if (saved) {
      try { setActiveRun(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const processedData = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return { parameterWise: [], nodeWise: [], keys: [] };

    const nodeMap: Record<string, NodeData> = {};
    const timestampMap: Record<number, BenchmarkDataPoint> = {};

    snapshots.forEach((snap) => {
      const ts = new Date(snap.last_updated_timestamp).getTime();
      if (!inRange(ts, range)) return;

      if (!timestampMap[ts]) {
        timestampMap[ts] = { timestamp: ts, label: formattedDate(ts, range) };
      }

      snap.gpu_nodes.forEach((node) => {
        node.gpus.forEach((gpu) => {
          const id = `${node.node_name}-${gpu.gpu_id}`;
          if (!nodeMap[id]) {
            nodeMap[id] = { id, name: `${node.node_name} (GPU ${gpu.gpu_id})`, data: [] };
          }

          const util = gpu.utilization_percent || 0;
          const vram = (gpu.memory_used_mib || 0) / 1024;
          const temp = gpu.temperature_celsius || 0;

          nodeMap[id].data.push({ timestamp: ts, label: formattedDate(ts, range), utilization: util, vram, temp });
          timestampMap[ts][`${id}_util`] = util;
          timestampMap[ts][`${id}_vram`] = vram;
          timestampMap[ts][`${id}_temp`] = temp;
        });
      });
    });

    Object.values(nodeMap).forEach(n => n.data.sort((a, b) => a.timestamp - b.timestamp));
    const paramData = Object.values(timestampMap).sort((a, b) => a.timestamp - b.timestamp);

    return { parameterWise: paramData, nodeWise: Object.values(nodeMap), keys: Object.keys(nodeMap) };
  }, [snapshots, range]);

  const hasData = processedData.parameterWise.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 font-sans">
      
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end mb-8 gap-6 border-b border-gray-800 pb-6">
        
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            {activeTab === "ml" ? "ML Benchmarks" : "System Metrics"}
          </h1>
          <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
            {activeTab === "ml"
              ? "Deep learning training efficiency and loss analysis."
              : "Real-time and historical overview of GPU utilization, memory consumption, and thermal status."}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3 w-full lg:w-auto">
          
          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${
                activeTab === "performance" ? "bg-gray-800 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Cluster Performance
            </button>
            <button
              onClick={() => setActiveTab("ml")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${
                activeTab === "ml" ? "bg-cyan-900/30 text-cyan-100 shadow-sm" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              ML Benchmarks
            </button>
          </div>

          <div className="flex items-center gap-3">
            
            {activeTab === "ml" && (
              <div className="flex items-center gap-3">
                {activeRun && (
                  <button 
                    onClick={handleCancelTraining}
                    disabled={isCanceling}
                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-md font-medium text-xs uppercase tracking-wide transition-colors shadow-lg flex items-center gap-2 animate-pulse"
                  >
                    {isCanceling ? "Stopping..." : `Stop Run (PID: ${activeRun.pid})`}
                  </button>
                )}
                
                {!activeRun && (
                  <button 
                    onClick={() => setModalOpen(true)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded-md font-medium text-xs uppercase tracking-wide transition-colors shadow-lg shadow-cyan-900/20 flex items-center gap-2"
                  >
                    <span>+</span> New Run
                  </button>
                )}
              </div>
            )}

            {activeTab === "performance" && (
              <div className="flex bg-gray-900 rounded-md p-1 border border-gray-800">
                {ranges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                      range === r ? "bg-cyan-600 text-white shadow" : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {activeTab === "performance" && (
          <div className="space-y-6">
            <div className="flex space-x-6 border-b border-gray-800 mb-6">
              <button
                onClick={() => setPerfSubTab("parameter")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors px-2 ${
                  perfSubTab === "parameter" ? "border-cyan-500 text-cyan-400" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                PARAMETER VIEW
              </button>
              <button
                onClick={() => setPerfSubTab("node")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors px-2 ${
                  perfSubTab === "node" ? "border-cyan-500 text-cyan-400" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                NODE VIEW
              </button>
            </div>

            {isHistoryLoading ? (
               <LoadingSkeleton />
            ) : !hasData ? (
              <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-800 rounded-xl bg-gray-900/30 text-gray-500">
                <p>No telemetry data found for this period.</p>
              </div>
            ) : (
              <>
                {perfSubTab === "parameter" ? (
                  <ParameterWiseView data={processedData.parameterWise} nodeKeys={processedData.keys} range={range} />
                ) : (
                  <NodeWiseView nodes={processedData.nodeWise} range={range} />
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "ml" && (
          <div className="space-y-6">
            {isMlLoading && !attentionMetrics ? (
               <LoadingSkeleton />
            ) : attentionMetrics ? (
              <MLBenchmarksView attentionMetrics={attentionMetrics} />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-800 rounded-xl bg-gray-900/30 text-gray-500">
                <p className="mb-4">No ML training data found.</p>
                {!activeRun && (
                  <button onClick={() => setModalOpen(true)} className="text-cyan-400 hover:underline hover:text-cyan-300 transition-colors">
                    Start a new run?
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <NewRunModal 
        isOpen={isModalOpen} 
        onClose={() => setModalOpen(false)} 
        onStart={handleStartTraining}
        isLoading={isStarting}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-64 bg-gray-900/50 rounded-lg border border-gray-800"></div>
      ))}
    </div>
  )
}

function ParameterWiseView({ data, nodeKeys, range }: { data: BenchmarkDataPoint[]; nodeKeys: string[]; range: string }) {
  const chartConfig = [
    { title: "GPU Utilization", keySuffix: "_util", unit: "%", yDomain: [0, 100] as [number, number] },
    { title: "VRAM Usage", keySuffix: "_vram", unit: " GB", yDomain: ["auto", "auto"] as const },
    { title: "GPU Temperature", keySuffix: "_temp", unit: "°C", yDomain: ["auto", "auto"] as const },
  ];

  const nodeColors = ["#3b82f6", "#ef4444", "#eab308", "#10b981", "#8b5cf6", "#f97316", "#06b6d4"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {chartConfig.map((config) => (
        <div key={config.title} className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-sm hover:border-gray-700 transition-colors">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-200">{config.title}</h3>
            <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400 border border-gray-700">{config.unit.trim()}</span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  {nodeKeys.map((nodeKey, idx) => (
                    <linearGradient key={nodeKey} id={`gradient-${config.keySuffix}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={nodeColors[idx % nodeColors.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={nodeColors[idx % nodeColors.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.3} />
                <XAxis dataKey="timestamp" tickFormatter={(ts) => formattedDate(ts, range)} stroke="#525252" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} minTickGap={30} />
                <YAxis stroke="#525252" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={config.yDomain} width={35} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "6px", fontSize: "12px", color: "#f1f5f9" }} labelFormatter={(ts) => new Date(ts).toLocaleString()} formatter={(value: number) => [value.toFixed(1) + config.unit, ""]} itemStyle={{ padding: 0 }} />
                <Legend wrapperStyle={{ paddingTop: "12px", fontSize: "11px" }} iconType="circle" />
                {nodeKeys.map((nodeKey, idx) => (
                  <Area key={nodeKey} type="monotone" dataKey={`${nodeKey}${config.keySuffix}`} name={nodeKey.replace("-", " ")} stroke={nodeColors[idx % nodeColors.length]} fill={`url(#gradient-${config.keySuffix}-${idx})`} strokeWidth={2} activeDot={{ r: 4, strokeWidth: 0 }} fillOpacity={1} connectNulls={true} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function NodeWiseView({ nodes, range }: { nodes: NodeData[]; range: string }) {
  if (nodes.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {nodes.map((node) => (
        <div key={node.id} className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{node.name}</h3>
              <div className="flex gap-3 mt-1.5">
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span><span className="text-[10px] text-gray-400 uppercase">Util</span></div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span><span className="text-[10px] text-gray-400 uppercase">VRAM</span></div>
                <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span className="text-[10px] text-gray-400 uppercase">Temp</span></div>
              </div>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={node.data}>
                <defs>
                  <linearGradient id="colorUtil" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} /><stop offset="95%" stopColor="#06b6d4" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorVram" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#eab308" stopOpacity={0.15} /><stop offset="95%" stopColor="#eab308" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.15} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.2} />
                <XAxis dataKey="timestamp" tickFormatter={(ts) => formattedDate(ts, range)} stroke="#525252" tick={{ fontSize: 10, fill: "#737373" }} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis yAxisId="left" stroke="#06b6d4" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} width={30} />
                <YAxis yAxisId="right" orientation="right" stroke="#eab308" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "6px", fontSize: "12px", color: "#f1f5f9" }} labelFormatter={(ts) => new Date(ts).toLocaleString()} />
                <Area yAxisId="left" type="monotone" dataKey="utilization" stroke="#06b6d4" fill="url(#colorUtil)" strokeWidth={2} />
                <Area yAxisId="right" type="monotone" dataKey="vram" stroke="#eab308" fill="url(#colorVram)" strokeWidth={2} />
                <Area yAxisId="left" type="monotone" dataKey="temp" stroke="#f43f5e" fill="url(#colorTemp)" strokeWidth={1.5} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function MLBenchmarksView({ attentionMetrics }: { attentionMetrics: AttentionMetricsResponse }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1"><RunConfigurationsTable /></div>
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 h-full shadow-sm">
            <h3 className="text-sm font-semibold text-white mb-4">Training Loss Comparison</h3>
            <div className="h-64">
              <MLBenchmarkChart
                baselineData={(attentionMetrics.sdpa?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
                flashData={(attentionMetrics.flash?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-4">GPU Memory Usage</h3>
          <div className="h-64"><GpuMemoryBarChart sdpaData={attentionMetrics.sdpa?.data || []} flashData={attentionMetrics.flash?.data || []} /></div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-4">RAM Usage</h3>
          <div className="h-64"><RamUsageBarChart sdpaData={attentionMetrics.sdpa?.data || []} flashData={attentionMetrics.flash?.data || []} /></div>
        </div>
      </div>
      <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 flex items-center gap-4">
        <div className="p-2 bg-blue-500/10 rounded-full">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-gray-300 text-sm">
            <strong className="text-blue-300">Observation: </strong>
            Both Flash Attention and SDPA consume comparable memory. Speed gains are algorithmic.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-4">Perplexity Evolution</h3>
          <div className="h-64"><PerplexityChart sdpaData={attentionMetrics.sdpa?.data || []} flashData={attentionMetrics.flash?.data || []} /></div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-white mb-2">Runtime per Epoch</h3>
          <div className="h-64"><RuntimePerEpochChart sdpaRuntime={attentionMetrics.sdpa?.runtimePerEpoch || []} flashRuntime={attentionMetrics.flash?.runtimePerEpoch || []} /></div>
        </div>
      </div>
    </div>
  );
}