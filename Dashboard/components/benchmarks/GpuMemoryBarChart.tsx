import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MetricEntry } from '@/types/cluster';

interface Props {
  sdpaData: MetricEntry[];
  flashData: MetricEntry[];
}

const TOTAL_GPU_MEMORY_GB = 94; // H100 NVL total memory

export default function GpuMemoryBarChart({ sdpaData, flashData }: Props) {
  const sdpaAvg = sdpaData.length > 0
    ? sdpaData.reduce((sum, d) => sum + (d.gpu_mem_GB || 0), 0) / sdpaData.length
    : 0;
  
  const flashAvg = flashData.length > 0
    ? flashData.reduce((sum, d) => sum + (d.gpu_mem_GB || 0), 0) / flashData.length
    : 0;

  const sdpaPercentage = (sdpaAvg / TOTAL_GPU_MEMORY_GB) * 100;
  const flashPercentage = (flashAvg / TOTAL_GPU_MEMORY_GB) * 100;
  const difference = flashAvg - sdpaAvg;

  const chartData = [
    {
      name: 'SDPA Attention',
      value: sdpaAvg,
      percentage: sdpaPercentage,
      color: '#F87171',
    },
    {
      name: 'Flash Attention',
      value: flashAvg,
      percentage: flashPercentage,
      color: '#34D399',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
            <XAxis 
              type="number" 
              domain={[0, (dataMax: number) => Math.max(1, dataMax * 1.2)]}
              stroke="#9CA3AF"
              tickFormatter={(value) => `${value.toFixed(2)} GB`}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              stroke="#9CA3AF"
              width={120}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
              // FIXED: payload is optional (?) and we fallback to 0
              formatter={(value: number, name: string, props: { payload?: { percentage: number } }) => [
                `${value.toFixed(2)} GB (${(props.payload?.percentage ?? 0).toFixed(2)}% of ${TOTAL_GPU_MEMORY_GB} GB)`,
                name
              ]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <span className="text-sm font-medium text-gray-300">SDPA Attention</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-red-400">{sdpaAvg.toFixed(2)} GB</div>
            <div className="text-xs text-gray-400">{sdpaPercentage.toFixed(2)}% of total</div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
            <span className="text-sm font-medium text-gray-300">Flash Attention</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-green-400">{flashAvg.toFixed(2)} GB</div>
            <div className="text-xs text-gray-400">{flashPercentage.toFixed(2)}% of total</div>
          </div>
        </div>

        <div className={`flex justify-between items-center p-3 rounded-lg border ${
          difference === 0 
            ? 'bg-gray-800 border-gray-700' 
            : difference > 0 
            ? 'bg-green-900/20 border-green-700' 
            : 'bg-red-900/20 border-red-700'
        }`}>
          <span className="text-sm font-medium text-gray-300">Difference</span>
          <div className="text-right">
            <span className={`text-sm font-semibold ${
              difference === 0 
                ? 'text-gray-400' 
                : difference > 0 
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              {difference > 0 ? '+' : ''}{difference.toFixed(2)} GB
            </span>
            {difference !== 0 && (
              <div className="text-xs text-gray-400">
                {difference > 0 ? 'Flash uses more' : 'SDPA uses more'}
              </div>
            )}
            {difference === 0 && (
              <div className="text-xs text-gray-400">No difference</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}