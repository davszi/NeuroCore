import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

interface ComparisonResult {
    timestamp: string;
    runId: string;
    node: string;
    gpuId: number;
    gpuName: string;
    results: {
        with_jobs: {
            duration: number;
            avgUtilization?: number;
            avgTemp?: number;
        };
        without_jobs: {
            duration: number;
            avgUtilization?: number;
            avgTemp?: number;
        };
    };
    performanceImpact: number;
}

interface Props {
    data: ComparisonResult[];
    range: string;
}

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

function formattedDate(ts: number, range: string) {
    const date = new Date(ts);
    if (range === "today") return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === "7d") return date.toLocaleDateString([], { weekday: 'short' });
    if (range === "month") return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (range === "1y") return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ComparisonHistoryGraph({ data, range }: Props) {
    // Extract unique nodes for generating separate lines
    const uniqueNodes = useMemo(() => {
        return Array.from(new Set(data.map(d => `${d.node} GPU${d.gpuId}`))).sort();
    }, [data]);

    const chartData = useMemo(() => {
        // We need to flatten data so each point has ONE timestamp and values for valid nodes at that time
        // Since runs are unique times, effectively each point is one node.
        // Recharts prefers consistent keys.
        return data.map(item => {
            const nodeKey = `${item.node} GPU${item.gpuId}`;
            return {
                timestamp: new Date(item.timestamp).getTime(),
                [nodeKey]: item.performanceImpact, // Dynamic key for this node
                node: nodeKey,
                gpuName: item.gpuName,
                performanceImpact: item.performanceImpact // Keep general for tooltip
            };
        }).sort((a, b) => a.timestamp - b.timestamp);
    }, [data]);

    if (chartData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-800 rounded-xl bg-gray-900/30 text-gray-500">
                <p>No comparison history data available for this time range.</p>
                <p className="text-sm mt-2">Run comparisons to see performance trends over time.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Performance Impact Over Time */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 shadow-sm">
                <div className="mb-4 border-b border-gray-800 pb-2">
                    <h3 className="text-sm font-bold text-white tracking-wide">Performance Impact Over Time (Node Wise)</h3>
                    <p className="text-[10px] text-gray-500 uppercase mt-0.5">
                        Percentage difference between with/without jobs
                    </p>
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.3} />
                            <XAxis
                                dataKey="timestamp"
                                tickFormatter={(ts) => formattedDate(ts, range)}
                                stroke="#525252"
                                tick={{ fontSize: 10, fill: "#737373" }}
                                tickLine={false}
                                axisLine={false}
                                type="number"
                                domain={['auto', 'auto']}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#525252"
                                tick={{ fontSize: 10, fill: "#9ca3af" }}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                                label={{ value: 'Impact (%)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' } }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "#0f172a",
                                    borderColor: "#1e293b",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    color: "#f1f5f9"
                                }}
                                labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)}%`,
                                    name
                                ]}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                iconType="line"
                            />

                            {/* Render a Line for each unique node */}
                            {uniqueNodes.map((nodeName, index) => (
                                <Line
                                    key={nodeName}
                                    type="monotone"
                                    dataKey={nodeName}
                                    name={nodeName}
                                    stroke={COLORS[index % COLORS.length]}
                                    strokeWidth={2}
                                    dot={{ r: 4, fill: COLORS[index % COLORS.length] }}
                                    activeDot={{ r: 6 }}
                                    connectNulls={true} // Connect points for same node across time
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="text-xs text-gray-400 uppercase mb-1">Total Comparisons</div>
                    <div className="text-2xl font-bold text-white">{data.length}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="text-xs text-gray-400 uppercase mb-1">Avg Performance Impact</div>
                    <div className="text-2xl font-bold text-amber-400">
                        {(data.reduce((sum, d) => sum + d.performanceImpact, 0) / data.length).toFixed(1)}%
                    </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="text-xs text-gray-400 uppercase mb-1">Nodes Tested</div>
                    <div className="text-2xl font-bold text-cyan-400">
                        {new Set(data.map(d => d.node)).size}
                    </div>
                </div>
            </div>
        </div>
    );
}
