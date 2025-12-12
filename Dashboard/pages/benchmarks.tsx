import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from "recharts";
import {
  ClusterState,
  AttentionMetricsResponse,
  TrainingJobConfig,
  MetricEntry
} from "@/types/cluster";

// --- Components ---
import GpuMemoryBarChart from "../components/benchmarks/GpuMemoryBarChart";
import RamUsageBarChart from "../components/benchmarks/RamUsageBarChart";
import PerplexityChart from "../components/benchmarks/PerplexityChart";
import RuntimePerEpochChart from "../components/benchmarks/RuntimePerEpochChart";
import MLBenchmarkChart from "../components/benchmarks/MLBenchmarkChart";
import RunConfigurationsTable from "../components/benchmarks/RunConfigurationsTable";
import NewRunModal from "@/components/benchmarks/NewRunModal"; 

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ---------------- Types -----------------
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

// ---------------- Helpers -----------------
function formattedDate(ts: number, range: string) {
  const date = new Date(ts);
  if (range === "today") return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === "7d") return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit' });
  return date.toLocaleDateString();
}

export default function BenchmarksPage() {
  // --- 1. Main Tabs (Cluster vs ML) ---
  const [activeTab, setActiveTab] = useState<"cluster" | "ml">("cluster");
  
  // --- 2. Inner Tabs for Cluster Health (Restored) ---
  const [clusterView, setClusterView] = useState<"overview" | "history">("overview");

  // --- Data Fetching ---
  const { data: snapshots = [], isLoading: isHistoryLoading } = useSWR<ClusterState[]>("/api/node-history", fetcher, {
    refreshInterval: 60000, 
  });

  const { data: attentionMetrics } = useSWR<AttentionMetricsResponse>("/api/attention-metrics", fetcher);

  const [range, setRange] = useState<"today" | "7d">("today");

  // --- New Run State ---
  const [isModalOpen, setModalOpen] = useState(false);
  const [isStarting, setStarting] = useState(false);

  const handleStartTraining = async (config: TrainingJobConfig, nodeName: string) => {
    setStarting(true);
    try {
      const res = await fetch('/api/start-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, nodeName }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start");
      }
      
      alert("Training started successfully!");
      setModalOpen(false);
    } catch (e: any) {
      alert("Error starting training: " + e.message);
    } finally {
      setStarting(false);
    }
  };

  // --- Data Processing ---
  const perNodeData = useMemo(() => {
    if (!snapshots || !snapshots.length) return [];
    
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const rangeMs = range === "today" ? msInDay : 7 * msInDay;
    const cutoff = now.getTime() - rangeMs;

    const nodesMap: Record<string, NodeData> = {};

    snapshots.forEach((snap) => {
      const ts = new Date(snap.last_updated_timestamp).getTime();
      if (ts < cutoff) return;

      const label = formattedDate(ts, range);

      snap.gpu_nodes.forEach(node => {
        if (!nodesMap[node.node_name]) {
          nodesMap[node.node_name] = { id: node.node_name, name: node.node_name, data: [] };
        }

        const point: BenchmarkDataPoint = { timestamp: ts, label };
        
        let totalUtil = 0;
        let totalPower = 0;
        let totalTemp = 0;
        let gpuCount = 0;

        node.gpus.forEach(gpu => {
          totalUtil += gpu.utilization_percent;
          totalPower += gpu.power_draw_watts || 0;
          totalTemp += gpu.temperature_celsius;
          gpuCount++;
        });

        if (gpuCount > 0) {
          point['gpuUtil'] = totalUtil / gpuCount;
          point['power'] = totalPower;
          point['temp'] = totalTemp / gpuCount;
        }

        nodesMap[node.node_name].data.push(point);
      });
    });

    return Object.values(nodesMap).map(node => ({
      ...node,
      data: node.data.sort((a, b) => a.timestamp - b.timestamp)
    }));
  }, [snapshots, range]);

  return (
    <div className="p-6 space-y-6 min-h-screen">
      
      {/* ---------------- MAIN HEADER & TABS ---------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-gray-800">
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
      </div>

      {/* ---------------- CLUSTER HEALTH TAB ---------------- */}
      {activeTab === "cluster" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          {/* --- INNER TABS (Restored Feature) --- */}
          <div className="flex items-center gap-4 mb-6 border-b border-gray-800 pb-2">
             <button
                onClick={() => setClusterView("overview")}
                className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                  clusterView === "overview" 
                    ? "border-cyan-500 text-white" 
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
             >
               Real-time Overview
             </button>
             <button
                onClick={() => setClusterView("history")}
                className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                  clusterView === "history" 
                    ? "border-cyan-500 text-white" 
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
             >
               Historical Analysis
             </button>
          </div>

          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">
              {clusterView === 'overview' ? 'Live System Status' : 'Historical Trends'}
            </h2>
            
            {/* Range Selector (Only for History) */}
            <div className="bg-gray-900 p-1 rounded-lg border border-gray-700 flex">
              {(['today', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    range === r ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {r === 'today' ? '24 Hours' : '7 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* --- CONTENT FOR CLUSTER TABS --- */}
          {isHistoryLoading && (
             <div className="flex justify-center py-20">
                <span className="text-cyan-500 animate-pulse">Loading history...</span>
             </div>
          )}

          {!isHistoryLoading && perNodeData.length === 0 && (
             <div className="bg-gray-900 border border-gray-700 rounded-lg p-10 text-center text-gray-400">
               No history data found for this period.
             </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {perNodeData.map((node) => (
              <div key={node.id} className="bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-sm">
                <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-800 pb-2">
                  {node.name}
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={node.data}>
                      <defs>
                        <linearGradient id="colorUtil" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="label" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                      <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#F3F4F6' }} />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="gpuUtil" name="GPU Util %" stroke="#06b6d4" fillOpacity={1} fill="url(#colorUtil)" />
                      <Area yAxisId="right" type="monotone" dataKey="power" name="Power (W)" stroke="#f59e0b" fillOpacity={1} fill="url(#colorPower)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- ML BENCHMARK TAB ---------------- */}
      {activeTab === "ml" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Attention Mechanism Comparison</h2>
            
            <button 
              onClick={() => setModalOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-lg shadow-cyan-900/20 flex items-center gap-2"
            >
              <span>+</span> New Run
            </button>
          </div>

          {!attentionMetrics && (
             <div className="flex justify-center py-20">
                <span className="text-cyan-500 animate-pulse">Loading ML metrics...</span>
             </div>
          )}

          {attentionMetrics && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <RunConfigurationsTable />
                </div>
                <div className="lg:col-span-2">
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 h-full">
                    <h3 className="text-lg font-semibold text-white mb-4">Training Loss Comparison</h3>
                    <div className="h-80">
                      <MLBenchmarkChart
                        baselineData={(attentionMetrics.sdpa?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
                        flashData={(attentionMetrics.flash?.data || []).map((d: MetricEntry) => ({ step: d.step, loss: d.loss || 0 }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Memory & RAM */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">GPU Memory Usage</h3>
                  <GpuMemoryBarChart
                    sdpaData={attentionMetrics.sdpa?.data || []}
                    flashData={attentionMetrics.flash?.data || []}
                  />
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">RAM Usage</h3>
                  <RamUsageBarChart
                    sdpaData={attentionMetrics.sdpa?.data || []}
                    flashData={attentionMetrics.flash?.data || []}
                  />
                </div>
              </div>

              {/* Insight */}
              <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 flex items-start gap-3">
                <div className="text-blue-400 mt-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

              {/* Perplexity & Runtime */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-white mb-4">Perplexity Evolution</h3>
                  <div className="h-64">
                    <PerplexityChart
                      sdpaData={attentionMetrics.sdpa?.data || []}
                      flashData={attentionMetrics.flash?.data || []}
                    />
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-white mb-2">Runtime per Epoch</h3>
                  <p className="text-xs text-gray-500 mb-4">Time taken (seconds) to complete each epoch.</p>
                  <div className="h-64">
                    <RuntimePerEpochChart
                      sdpaRuntime={attentionMetrics.sdpa?.runtimePerEpoch || []}
                      flashRuntime={attentionMetrics.flash?.runtimePerEpoch || []}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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