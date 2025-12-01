import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface MetricEntry {
  step: number;
  ram_usage_GB: number;
}

interface Props {
  sdpaData: MetricEntry[];
  flashData: MetricEntry[];
}

const TOTAL_RAM_GB = 1100; // 1.1 TB system RAM

export default function RamUsageDonutChart({ sdpaData, flashData }: Props) {
  // Calculate average RAM usage
  const sdpaAvg = sdpaData.length > 0
    ? sdpaData.reduce((sum, d) => sum + d.ram_usage_GB, 0) / sdpaData.length
    : 0;
  
  const flashAvg = flashData.length > 0
    ? flashData.reduce((sum, d) => sum + d.ram_usage_GB, 0) / flashData.length
    : 0;

  const sdpaPercentage = (sdpaAvg / TOTAL_RAM_GB) * 100;
  const flashPercentage = (flashAvg / TOTAL_RAM_GB) * 100;
  const difference = flashAvg - sdpaAvg;

  // Data for the donut (used vs unused)
  const donutData = [
    { name: 'Used', value: Math.max(sdpaAvg, flashAvg), color: '#60A5FA' },
    { name: 'Available', value: TOTAL_RAM_GB - Math.max(sdpaAvg, flashAvg), color: '#374151' },
  ];

  return (
    <div className="space-y-4">
      {/* Donut Chart */}
      <div className="flex justify-center">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
            >
              {donutData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
              formatter={(value: number) => `${value.toFixed(2)} GB`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Center Text */}
      <div className="text-center -mt-[180px] relative z-10">
        <div className="text-2xl font-bold text-white">
          {Math.max(sdpaAvg, flashAvg).toFixed(2)} GB
        </div>
        <div className="text-xs text-gray-400">
          {((Math.max(sdpaAvg, flashAvg) / TOTAL_RAM_GB) * 100).toFixed(2)}% of {TOTAL_RAM_GB} GB
        </div>
      </div>

      {/* Comparison Metrics */}
      <div className="space-y-2 pt-4">
        <div className="flex justify-between items-center p-2 bg-gray-800 rounded">
          <span className="text-sm text-gray-300">SDPA Attention</span>
          <span className="text-sm font-semibold text-red-400">
            {sdpaAvg.toFixed(2)} GB ({sdpaPercentage.toFixed(2)}%)
          </span>
        </div>
        <div className="flex justify-between items-center p-2 bg-gray-800 rounded">
          <span className="text-sm text-gray-300">Flash Attention</span>
          <span className="text-sm font-semibold text-green-400">
            {flashAvg.toFixed(2)} GB ({flashPercentage.toFixed(2)}%)
          </span>
        </div>
        <div className="flex justify-between items-center p-2 bg-blue-900/30 border border-blue-700 rounded">
          <span className="text-sm text-gray-300">Difference</span>
          <span className={`text-sm font-semibold ${difference > 0 ? 'text-green-400' : difference < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            {difference > 0 ? '+' : ''}{difference.toFixed(2)} GB
            {difference !== 0 && (
              <span className="ml-1 text-xs">
                ({difference > 0 ? 'Flash uses more' : 'SDPA uses more'})
              </span>
            )}
            {difference === 0 && (
              <span className="ml-1 text-xs text-gray-400">(No difference)</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

