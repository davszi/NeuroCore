import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MetricEntry {
  step: number;
  gpu_mem_GB: number;
  ram_usage_GB: number;
}

interface Props {
  sdpaData: MetricEntry[];
  flashData: MetricEntry[];
}

export default function GpuMemoryChart({ sdpaData, flashData }: Props) {
  // Combine data by step
  const maxSteps = Math.max(
    sdpaData.length > 0 ? sdpaData[sdpaData.length - 1].step : 0,
    flashData.length > 0 ? flashData[flashData.length - 1].step : 0
  );

  const combinedData: Array<{
    step: number;
    'SDPA GPU Memory': number | null;
    'Flash GPU Memory': number | null;
    'SDPA RAM Usage': number | null;
    'Flash RAM Usage': number | null;
  }> = [];
  const sdpaGpuMap = new Map(sdpaData.map(d => [d.step, d.gpu_mem_GB]));
  const flashGpuMap = new Map(flashData.map(d => [d.step, d.gpu_mem_GB]));
  const sdpaRamMap = new Map(sdpaData.map(d => [d.step, d.ram_usage_GB]));
  const flashRamMap = new Map(flashData.map(d => [d.step, d.ram_usage_GB]));

  // Get all unique steps
  const allSteps = new Set([
    ...sdpaData.map(d => d.step),
    ...flashData.map(d => d.step)
  ]);
  const sortedSteps = Array.from(allSteps).sort((a, b) => a - b);

  sortedSteps.forEach(step => {
    combinedData.push({
      step,
      'SDPA GPU Memory': sdpaGpuMap.get(step) ?? null,
      'Flash GPU Memory': flashGpuMap.get(step) ?? null,
      'SDPA RAM Usage': sdpaRamMap.get(step) ?? null,
      'Flash RAM Usage': flashRamMap.get(step) ?? null,
    });
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={combinedData}
        margin={{
          top: 5,
          right: 20,
          left: 10,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
        <XAxis 
          dataKey="step" 
          stroke="#9CA3AF"
          label={{ value: 'Training Step', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
        />
        <YAxis 
          yAxisId="gpu"
          stroke="#60A5FA"
          label={{ value: 'GPU Memory (GB)', angle: -90, position: 'insideLeft', offset: 20, fill: '#60A5FA' }}
        />
        <YAxis 
          yAxisId="ram"
          orientation="right"
          stroke="#FBBF24"
          label={{ value: 'RAM Usage (GB)', angle: 90, position: 'insideRight', offset: 10, fill: '#FBBF24' }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value: number, name: string) => {
            if (value === null) return 'N/A';
            return `${value.toFixed(2)} GB`;
          }}
        />
        <Legend wrapperStyle={{ color: '#D1D5DB' }} />
        {/* GPU Memory Lines */}
        <Line 
          yAxisId="gpu"
          type="monotone" 
          dataKey="SDPA GPU Memory" 
          stroke="#F87171"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line 
          yAxisId="gpu"
          type="monotone" 
          dataKey="Flash GPU Memory" 
          stroke="#34D399"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        {/* RAM Usage Lines */}
        <Line 
          yAxisId="ram"
          type="monotone" 
          dataKey="SDPA RAM Usage" 
          stroke="#FB7185"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls={false}
        />
        <Line 
          yAxisId="ram"
          type="monotone" 
          dataKey="Flash RAM Usage" 
          stroke="#4ADE80"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

