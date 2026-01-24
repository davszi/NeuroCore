import { useMemo, useState, useEffect } from "react";
import BenchmarkLogin from "@/components/benchmarks/BenchmarkLogin";
import useSWR from "swr";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  ClusterState,
} from "@/types/cluster";

import PerformanceBenchmarkModal from "@/components/benchmarks/performance/PerformanceBenchmarkModal";
import BenchmarkResultsView, { BenchmarkResult } from "@/components/benchmarks/performance/BenchmarkResultsView";
import { MonthlyBenchmarkData } from "@/components/benchmarks/performance/MonthlyComparisonChart";
import MLBenchmarkTab from "@/components/benchmarks/ml-benchmark-tab/MLBenchmarkTab";
import { HiCog } from "react-icons/hi";
import DeployModal from "@/components/benchmarks/DeployModal";

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
  if (range === "7d") return date.toLocaleDateString([], { weekday: 'short' }); // Just day name, ticks logic handles separation
  if (range === "1y") return date.toLocaleDateString([], { month: 'short' });
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

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = sessionStorage.getItem('benchmarkAuthToken');
      setIsAuthenticated(!!token);
    }
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoginError(undefined);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem('benchmarkAuthToken', data.token);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (e: any) {
      setLoginError(e.message || 'Login failed');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('benchmarkAuthToken');
    setIsAuthenticated(false);
  };

  // State
  const [activeTab, setActiveTab] = useState<"performance" | "ml" | "perf-benchmark">("performance");
  const [perfSubTab, setPerfSubTab] = useState<"parameter" | "node">("parameter");
  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");
  const [isPerfBenchmarkModalOpen, setPerfBenchmarkModalOpen] = useState(false);
  const [isPerfBenchmarkStarting, setPerfBenchmarkStarting] = useState(false);
  const [perfBenchmarkError, setPerfBenchmarkError] = useState<string | undefined>();
  const [currentBenchmarkId, setCurrentBenchmarkId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyBenchmarkData[]>([]);
  const [isDeployOpen, setIsDeployOpen] = useState(false);

  // Data Fetching
  const { data: snapshots = [], isLoading: isHistoryLoading } = useSWR<ClusterState[]>("/api/node-history", fetcher, { refreshInterval: 60000 });
  // Performance Benchmark Status Polling
  const { data: benchmarkStatus } = useSWR(
    currentBenchmarkId ? `/api/performance-benchmark/status?benchmarkId=${currentBenchmarkId}` : null,
    fetcher,
    { refreshInterval: 2000 } // Poll every 2 seconds when benchmark is running
  );

  // Monthly Benchmark Data
  const { data: monthlyBenchmarkData } = useSWR<{ data: MonthlyBenchmarkData[] }>(
    "/api/performance-benchmark/monthly",
    fetcher,
    { refreshInterval: 60000 }
  );

  const ranges = ["today", "7d", "month", "1y"] as const;



  // Update benchmark results when status changes
  useEffect(() => {
    if (benchmarkStatus) {
      console.log('[Frontend] Benchmark Status:', {
        benchmarkId: currentBenchmarkId,
        isRunning: benchmarkStatus.isRunning,
        resultsCount: benchmarkStatus.results?.length || 0,
        completedCount: benchmarkStatus.results?.filter((r: BenchmarkResult) => r.status === 'completed').length || 0,
      });
      setBenchmarkResults(benchmarkStatus.results || []);
      if (!benchmarkStatus.isRunning && currentBenchmarkId) {
        // Benchmark completed, fetch monthly data
        console.log('[Frontend] Benchmark completed!');
        setCurrentBenchmarkId(null);
      }
    }
  }, [benchmarkStatus, currentBenchmarkId]);

  // Update monthly data
  useEffect(() => {
    if (monthlyBenchmarkData?.data) {
      setMonthlyData(monthlyBenchmarkData.data);
    }
  }, [monthlyBenchmarkData]);

  // Performance Benchmark Handlers
  const handleStartPerformanceBenchmark = async (password: string) => {
    setPerfBenchmarkStarting(true);
    setPerfBenchmarkError(undefined);

    try {
      const res = await fetch('/api/performance-benchmark/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start benchmark");
      }

      setCurrentBenchmarkId(data.benchmarkId);
      setPerfBenchmarkModalOpen(false);
      setBenchmarkResults([]); // Reset results
    } catch (e: any) {
      setPerfBenchmarkError(e.message);
    } finally {
      setPerfBenchmarkStarting(false);
    }
  };

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

  if (!isAuthenticated) {
    return <BenchmarkLogin onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 font-sans">

      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end mb-8 gap-6 border-b border-gray-800 pb-6">

        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            {activeTab === "ml" ? "ML Benchmarks" : activeTab === "perf-benchmark" ? "Performance Benchmark" : "System Metrics"}
          </h1>
          <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
            {activeTab === "ml"
              ? "Deep learning training efficiency and loss analysis."
              : activeTab === "perf-benchmark"
                ? "Monthly GPU performance comparison to track degradation over time."
                : "Real-time and historical overview of GPU utilization, memory consumption, and thermal status."}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3 w-full lg:w-auto">

          <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsDeployOpen(true)}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-gray-400 hover:text-cyan-400 transition-colors border border-gray-700"
                title="Deploy Backend Engine"
            >
                <HiCog className="w-6 h-6" />
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors border border-gray-700"
            >
              Logout
            </button>
          </div>

          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === "performance" ? "bg-gray-800 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
                }`}
            >
              Cluster Performance
            </button>
            <button
              onClick={() => setActiveTab("perf-benchmark")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === "perf-benchmark" ? "bg-red-900/30 text-red-100 shadow-sm" : "text-gray-400 hover:text-gray-200"
                }`}
            >
              Performance Benchmark
            </button>
            <button
              onClick={() => setActiveTab("ml")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === "ml" ? "bg-cyan-900/30 text-cyan-100 shadow-sm" : "text-gray-400 hover:text-gray-200"
                }`}
            >
              ML Benchmarks
            </button>
          </div>

          <div className="flex items-center gap-3">

            {activeTab === "performance" && (
              <div className="flex bg-gray-900 rounded-md p-1 border border-gray-800">
                {ranges.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all ${range === r ? "bg-cyan-600 text-white shadow" : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {activeTab === "perf-benchmark" && (
              <button
                onClick={() => setPerfBenchmarkModalOpen(true)}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-md font-medium text-xs uppercase tracking-wide transition-colors shadow-lg flex items-center gap-2"
              >
                <span>+</span> Start Benchmark
              </button>
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
                className={`pb-3 text-sm font-medium border-b-2 transition-colors px-2 ${perfSubTab === "parameter" ? "border-cyan-500 text-cyan-400" : "border-transparent text-gray-400 hover:text-gray-200"
                  }`}
              >
                PARAMETER VIEW
              </button>
              <button
                onClick={() => setPerfSubTab("node")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors px-2 ${perfSubTab === "node" ? "border-cyan-500 text-cyan-400" : "border-transparent text-gray-400 hover:text-gray-200"
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
          <MLBenchmarkTab activeTab="ml" />
        )}

        {activeTab === "perf-benchmark" && (
          <div className="space-y-6">
            <BenchmarkResultsView
              results={benchmarkResults}
              monthlyData={monthlyData}
              isRunning={benchmarkStatus?.isRunning || false}
              currentGpu={benchmarkStatus?.currentGpu}
              status={benchmarkStatus?.status}
              logs={benchmarkStatus?.logs}
              onRetry={() => setPerfBenchmarkModalOpen(true)}
              benchmarkId={currentBenchmarkId}
            />
          </div>
        )}
      </main>

      <PerformanceBenchmarkModal
        isOpen={isPerfBenchmarkModalOpen}
        onClose={() => {
          setPerfBenchmarkModalOpen(false);
          setPerfBenchmarkError(undefined);
        }}
        onStart={handleStartPerformanceBenchmark}
        isLoading={isPerfBenchmarkStarting}
        error={perfBenchmarkError}
      />

      <DeployModal 
        isOpen={isDeployOpen} 
        onClose={() => setIsDeployOpen(false)} 
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

  // Ultra-expanded color palette to ensure uniqueness across large clusters (40+ colors)
  const colors = [
    "#3b82f6", "#ef4444", "#fbbf24", "#10b981", "#8b5cf6", "#f97316", "#06b6d4",
    "#ec4899", "#6366f1", "#14b8a6", "#f59e0b", "#84cc16", "#d946ef", "#0ea5e9",
    "#f43f5e", "#22c55e", "#a855f7", "#64748b", "#cbd5e1", "#475569",
    "#94a3b8", "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#4ade80", "#2dd4bf",
    "#22d3ee", "#38bdf8", "#818cf8", "#a78bfa", "#c084fc", "#e879f9", "#f472b6",
    "#fb7185", "#57534e", "#a8a29e", "#d6d3d1", "#e7e5e4", "#f5f5f4"
  ];

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Group nodeKeys by node name for the legend
  const groupedKeys = useMemo(() => {
    const groups: Record<string, string[]> = {};
    nodeKeys.forEach(key => {
      // Robustly extract node name: cloud-243-0 or cloud-243-gpu-0 -> cloud-243
      const parts = key.split('-');
      let nodeName = key;
      if (parts[0] === 'cloud' && parts[1]) {
        nodeName = `cloud-${parts[1]}`;
      } else if (parts.length > 1) {
        nodeName = parts.slice(0, parts.length - 1).join('-');
      }

      if (!groups[nodeName]) groups[nodeName] = [];
      groups[nodeName].push(key);
    });

    // Sort nodes by name (natural order)
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    );
  }, [nodeKeys]);

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

  const { ticks, domain } = useMemo(() => {
    const end = Date.now();
    let start = end;
    let generatedTicks: number[] | undefined = undefined;

    if (range === '7d') {
      start = end - 7 * 24 * 60 * 60 * 1000;
      generatedTicks = [];
      for (let i = 6; i >= 0; i--) {
        generatedTicks.push(end - i * 24 * 60 * 60 * 1000);
      }
    } else if (range === '1y') {
      start = end - 365 * 24 * 60 * 60 * 1000;
      generatedTicks = [];
      for (let i = 11; i >= 0; i--) {
        generatedTicks.push(end - i * 30 * 24 * 60 * 60 * 1000);
      }
    } else if (data.length > 0) {
      start = Math.min(...data.map(d => d.timestamp));
    }

    return {
      ticks: generatedTicks,
      domain: range === '7d' || range === '1y' ? [start, end] : ['auto', 'auto']
    };
  }, [data, range]);

  return (
    <div className="space-y-6">
      {/* Dynamic Summary Header */}
      <div className="bg-gray-950/40 border border-gray-800 rounded-lg p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Active Nodes</span>
            <span className="text-xl font-bold text-white">{Object.keys(groupedKeys).length}</span>
          </div>
          <div className="h-8 w-px bg-gray-800" />
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Live GPUs</span>
            <span className="text-xl font-bold text-cyan-400">{nodeKeys.length}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHiddenKeys(new Set())}
            className="px-3 py-1 rounded text-[10px] font-bold bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-all uppercase"
          >
            Show All
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {chartConfig.map((config) => (
          <div key={config.title} className="bg-[#0f1117] border border-gray-800/40 rounded-xl overflow-hidden p-6 shadow-2xl flex flex-col h-[480px]">
            <div className="flex items-start justify-between mb-6">
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
                        const idx = nodeKeys.indexOf(key);
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
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} opacity={0.03} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={domain}
                    ticks={ticks}
                    stroke="#4b5563"
                    tick={{ fontSize: 9, fill: "#4b5563" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(unixTime) => formattedDate(unixTime, range)}
                    scale="time"
                  />
                  <YAxis
                    stroke="#4b5563"
                    tick={{ fontSize: 9, fill: "#4b5563" }}
                    tickLine={false}
                    axisLine={false}
                    domain={config.yDomain}
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
                    labelFormatter={(label) => new Date(label).toLocaleString()}
                    formatter={(value: number, name: string, props: any) => [
                      <div className="flex items-center gap-2" key={name}>
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: props.color }}
                        />
                        <span className="text-gray-400 uppercase text-[9px] tracking-wider">{name.replace("-", " ")}</span>
                        <span className="font-bold text-white ml-auto">{value.toFixed(1)}{config.unit}</span>
                      </div>,
                      null // Suppress default name rendering
                    ]}
                  />
                  {nodeKeys.map((nodeKey, idx) => {
                    const isHidden = hiddenKeys.has(nodeKey);
                    if (isHidden) return null;
                    const isHighlighted = !hoveredKey || nodeKey === hoveredKey || nodeKey.startsWith(hoveredKey + '-');

                    return (
                      <Area
                        key={nodeKey}
                        type="monotone"
                        dataKey={`${nodeKey}${config.keySuffix}`}
                        stroke={colors[idx % colors.length]}
                        strokeWidth={isHighlighted ? 3 : 1.5}
                        fill="transparent"
                        strokeOpacity={isHighlighted ? 1 : 0.4}
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: colors[idx % colors.length] }}
                        connectNulls={true}
                        animationDuration={500}
                        name={nodeKey.replace('cloud-', 'NODE ').replace('-', ' GPU ')}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeWiseView({ nodes, range }: { nodes: NodeData[]; range: string }) {
  const { ticks, domain } = useMemo(() => {
    const end = Date.now();
    let start = end;
    let generatedTicks: number[] | undefined = undefined;

    if (range === '7d') {
      start = end - 7 * 24 * 60 * 60 * 1000;
      generatedTicks = [];
      for (let i = 6; i >= 0; i--) {
        generatedTicks.push(end - i * 24 * 60 * 60 * 1000);
      }
    } else if (range === '1y') {
      start = end - 365 * 24 * 60 * 60 * 1000;
      generatedTicks = [];
      for (let i = 11; i >= 0; i--) {
        generatedTicks.push(end - i * 30 * 24 * 60 * 60 * 1000);
      }
    }

    return {
      ticks: generatedTicks,
      domain: range === '7d' || range === '1y' ? [start, end] : ['auto', 'auto']
    };
  }, [nodes, range]);

  if (nodes.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {nodes.map((node) => (
        <div key={node.id} className="bg-[#0f1117] border border-gray-800/40 rounded-xl overflow-hidden p-5 shadow-xl flex flex-col h-[320px]">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-0.5">
              <h3 className="text-[10px] font-bold text-gray-200 tracking-[0.1em] uppercase">
                {node.name.replace('cloud-', 'NODE ')}
              </h3>
              <p className="text-[8px] text-gray-500 font-mono tracking-widest uppercase">TELEMETRY</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-0.5 rounded-full bg-cyan-500" />
                <span className="text-[8px] font-bold text-gray-500 uppercase">Util</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-0.5 rounded-full bg-yellow-500" />
                <span className="text-[8px] font-bold text-gray-500 uppercase">VRAM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-0.5 rounded-full bg-rose-500" />
                <span className="text-[8px] font-bold text-gray-500 uppercase">Temp</span>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={node.data} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" vertical={false} opacity={0.03} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => formattedDate(ts, range)}
                  stroke="#4b5563"
                  tick={{ fontSize: 8, fill: "#4b5563" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                  ticks={ticks}
                  domain={domain as any}
                  type="number"
                />
                <YAxis yAxisId="left" stroke="#4b5563" tick={{ fontSize: 8, fill: "#4b5563" }} axisLine={false} tickLine={false} domain={[0, 100]} width={30} />
                <YAxis yAxisId="right" orientation="right" stroke="#4b5563" tick={{ fontSize: 8, fill: "#4b5563" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f1117",
                    borderColor: "#1f2937",
                    borderRadius: "6px",
                    fontSize: "9px",
                    color: "#f3f4f6"
                  }}
                  labelFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                  formatter={(value: number, name: string, props: any) => [
                    <div className="flex items-center gap-2" key={name}>
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: props.color }}
                      />
                      <span className="text-gray-400 capitalize text-[9px] tracking-wider">{name}</span>
                      <span className="font-bold text-white ml-auto">{value.toFixed(1)}{name === 'vram' ? 'GB' : name === 'temp' ? '°C' : '%'}</span>
                    </div>,
                    null
                  ]}
                />
                <Area yAxisId="left" type="monotone" dataKey="utilization" name="utilization" stroke="#06b6d4" fill="transparent" strokeWidth={2.5} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="vram" name="vram" stroke="#eab308" fill="transparent" strokeWidth={2.5} dot={false} />
                <Area yAxisId="left" type="monotone" dataKey="temp" name="temperature" stroke="#f43f5e" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
