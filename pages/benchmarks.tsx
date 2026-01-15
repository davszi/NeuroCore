import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { ClusterState } from "@/types/cluster";
import MLBenchmarkTab from "@/components/benchmarks/ml-benchmark-tab/MLBenchmarkTab";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --- Types for Performance Tab ---
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

// --- Helpers for Performance Tab ---
function formattedDate(ts: number, range: string) {
  const date = new Date(ts);
  if (range === "today") return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === "7d") return date.toLocaleDateString([], { weekday: 'short' }); 
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
  // --- Data Fetching (System Metrics ONLY) ---
  const { data: snapshots = [], isLoading: isHistoryLoading } = useSWR<ClusterState[]>("/api/node-history", fetcher, { refreshInterval: 60000 });

  // --- State ---
  const [activeTab, setActiveTab] = useState<"performance" | "ml">("performance");
  
  // Performance Tab Specific State
  const [perfSubTab, setPerfSubTab] = useState<"parameter" | "node">("parameter");
  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");

  const ranges = ["today", "7d", "month", "1y"] as const;

  // --- Data Processing for Performance Charts ---
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

          {/* Tab Switcher */}
          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setActiveTab("performance")}
              className={`px-5 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === "performance" ? "bg-gray-800 text-white shadow-sm" : "text-gray-400 hover:text-gray-200"
                }`}
            >
              Cluster Performance
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
            {/* Range Controls (Only visible on Performance Tab) */}
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
            {/* Note: ML Controls (Start/Stop) are now handled inside MLBenchmarkTab, so we don't render them here */}
          </div>
        </div>
      </header>

      <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">

        {/* PERFORMANCE TAB CONTENT (Kept Exactly Same) */}
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

        {/* ML TAB CONTENT (Replaced with New Component) */}
        {activeTab === "ml" && (
            <MLBenchmarkTab activeTab="ml" />
        )}
      </main>
    </div>
  );
}

// --- Sub-components for Performance View (Kept as is) ---

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
    { title: "GPU Utilization", keySuffix: "_util", unit: "%", yDomain: [0, 100] as [number, number], color: "#06b6d4" },
    { title: "VRAM Usage", keySuffix: "_vram", unit: " GB", yDomain: ["auto", "auto"] as const, color: "#eab308" },
    { title: "GPU Temperature", keySuffix: "_temp", unit: "°C", yDomain: ["auto", "auto"] as const, color: "#f43f5e" },
  ];

  const nodeColors = ["#3b82f6", "#ef4444", "#eab308", "#10b981", "#8b5cf6", "#f97316", "#06b6d4"];


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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {chartConfig.map((config) => (
        <div key={config.title} className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
          <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{config.title}</h3>
              <p className="text-[10px] text-gray-500 uppercase mt-0.5 mb-2 md:mb-0">Unit: {config.unit.trim()}</p>
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5 md:mt-0 justify-end">
              {nodeKeys.slice(0, 4).map((nodeKey, idx) => (
                <div key={nodeKey} className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: nodeColors[idx % nodeColors.length] }}
                  />
                  <span className="text-[10px] text-gray-400 uppercase">
                    {nodeKey.replace(/cloud-|gpu\s?/gi, '').replace('-', '')}
                  </span>
                </div>
              ))}
            </div>
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
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => formattedDate(ts, range)}
                  stroke="#525252"
                  tick={{ fontSize: 10, fill: "#737373" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={range === 'today' ? 60 : 10}
                  ticks={ticks}
                  domain={domain as any}
                  type="number"
                  interval={ticks ? 0 : 'preserveStartEnd'}
                />
                <YAxis stroke="#525252" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={config.yDomain} width={35} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "6px", fontSize: "12px", color: "#f1f5f9" }} labelFormatter={(ts) => new Date(ts).toLocaleString()} formatter={(value: number, name: string) => [value.toFixed(1) + config.unit, name.replace('-', ' ')]} itemStyle={{ padding: 0 }} />
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
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => formattedDate(ts, range)}
                  stroke="#525252"
                  tick={{ fontSize: 10, fill: "#737373" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={range === 'today' ? 60 : 10}
                  ticks={ticks}
                  domain={domain as any}
                  type="number"
                  interval={ticks ? 0 : 'preserveStartEnd'}
                />
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