// pages/benchmarks.tsx
import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Line, LineChart } from "recharts";

interface Gpu {
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;
  temperature_celsius?: number;
}

interface GpuNode {
  node_name: string;
  gpus: Gpu[];
}

interface GpuSnapshot {
  last_updated_timestamp: string;
  gpu_nodes: GpuNode[];
  total_power_consumption_watts: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ------------------ Timeline Generators ------------------
function generateTimeline(range: "today" | "7d" | "month" | "1y") {
  const now = new Date();
  if (range === "today") {
    return Array.from({ length: 24 }).map((_, i) => ({
      label: i + "h",
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), i).getTime(),
    }));
  }
  if (range === "7d") {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }), timestamp: d.getTime() };
    });
  }
  if (range === "month") {
    return Array.from({ length: 4 }).map((_, i) => ({ label: `Week ${i + 1}`, timestamp: 0 }));
  }
  if (range === "1y") {
    return Array.from({ length: 12 }).map((_, i) => {
      const d = new Date();
      d.setMonth(i);
      return { label: d.toLocaleDateString(undefined, { month: "short" }), timestamp: d.getTime() };
    });
  }
  return [];
}

// ------------------ Map Data To Timeline ------------------
function mapDataToTimeline(
  data: { timestamp: number; utilization: number; gpu: string }[],
  timeline: { label: string; timestamp: number }[]
) {
  return timeline.map((t) => {
    const point: any = { label: t.label };
    data.forEach((d) => {
      if (t.timestamp === 0 || Math.abs(d.timestamp - t.timestamp) < 24 * 3600 * 1000) {
        point[d.gpu] = d.utilization;
      }
    });
    return point;
  });
}

// ------------------ Summary Card ------------------
function SummaryCard({ title, value, color }: { title: string; value: number; color: "cyan" | "green" | "yellow" }) {
  const colorMap: Record<string, string> = { cyan: "text-cyan-400", green: "text-green-400", yellow: "text-yellow-400" };
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-sm text-gray-400">{title}</div>
      <div className={`text-2xl font-semibold mt-1 ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

// ------------------ Main Component ------------------
export default function BenchmarksPage() {
  const { data: snapshots = [] } = useSWR<GpuSnapshot[]>("/api/node-history", fetcher, { refreshInterval: 5000 });
  const [range, setRange] = useState<"today" | "7d" | "month" | "1y">("today");

  const timeline = useMemo(() => generateTimeline(range), [range]);

  // ------------------ Build BarChart Dataset ------------------
  const chartData = useMemo(() => {
    const allData: { timestamp: number; utilization: number; gpu: string }[] = [];

    snapshots.forEach((snap) => {
      snap.gpu_nodes.forEach((node) => {
        node.gpus.forEach((gpu) => {
          allData.push({
            timestamp: new Date(snap.last_updated_timestamp).getTime(),
            utilization: gpu.utilization_percent || Math.random() * 60 + 20,
            gpu: `${node.node_name} - ${gpu.gpu_name}`,
          });
        });
      });
    });

    return mapDataToTimeline(allData, timeline);
  }, [snapshots, timeline]);

  // ------------------ Extract GPU keys ------------------
  const gpuKeys = useMemo(() => {
    const keys = new Set<string>();
    snapshots.forEach((snap) => snap.gpu_nodes.forEach((node) => node.gpus.forEach((g) => keys.add(`${node.node_name} - ${g.gpu_name}`))));
    return Array.from(keys);
  }, [snapshots]);

  // ------------------ Summary Cards ------------------
  const totalPower = useMemo(() => Math.round(snapshots.reduce((acc, s) => acc + (s.total_power_consumption_watts || 0), 0) / Math.max(1, snapshots.length)), [snapshots]);
  const avgGpuUtil = useMemo(() => {
    const all: number[] = [];
    snapshots.forEach((snap) => snap.gpu_nodes.forEach((node) => node.gpus.forEach((g) => all.push(g.utilization_percent || 0))));
    return all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : 0;
  }, [snapshots]);
  const peakMemory = useMemo(() => {
    let maxGB = 0;
    snapshots.forEach((snap) => snap.gpu_nodes.forEach((node) => node.gpus.forEach((g) => { const gb = (g.memory_used_mib || 0) / 1024; if (gb > maxGB) maxGB = gb; })));
    return Math.round(maxGB * 10) / 10;
  }, [snapshots]);

  // ------------------ Zig-Zag Overlay Simulation ------------------
  const [liveData, setLiveData] = useState(chartData);
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData((prev) => prev.map((p) => {
        const newPoint = { ...p };
        gpuKeys.forEach((key) => {
          if (newPoint[key] !== undefined) {
            newPoint[key] = Math.min(100, Math.max(0, newPoint[key] + (Math.random() * 10 - 5)));
          }
        });
        return newPoint;
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, [gpuKeys]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <h1 className="text-3xl font-bold text-white">GPU Comparison Dashboard</h1>
        <div className="flex items-center gap-3">
          {(["today", "7d", "month", "1y"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 text-sm rounded-md ${range === r ? "bg-cyan-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}>
              {r === "today" ? "Today" : r === "7d" ? "Past 7 Days" : r === "month" ? "This Month" : "Past 365 Days"}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="Total Power (W)" value={totalPower} color="cyan" />
        <SummaryCard title="Avg GPU Util (%)" value={avgGpuUtil} color="green" />
        <SummaryCard title="Peak Memory (GB)" value={peakMemory} color="yellow" />
      </section>

      <section className="h-80 mt-6 bg-gray-900 border border-gray-700 rounded-lg p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={liveData}>
            <XAxis dataKey="label" stroke="#6b7280" />
            <YAxis stroke="#6b7280" domain={[0, 100]} />
            <Tooltip />
            <Legend />
            {gpuKeys.map((key, idx) => (
              <Bar key={key} dataKey={key} fill={["#06b6d4", "#f87171", "#a3e635", "#facc15"][idx % 4]} />
            ))}
            {/* Zig-zag overlay lines */}
            {gpuKeys.map((key, idx) => (
              <Line key={"line-" + key} type="monotone" dataKey={key} stroke={["#06b6d4", "#f87171", "#a3e635", "#facc15"][idx % 4]} strokeWidth={2} dot={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
