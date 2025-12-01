import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MetricEntry {
  step: number;
  ram_usage_GB: number;
}

interface Props {
  sdpaData: MetricEntry[];
  flashData: MetricEntry[];
}

export default function RamUsageChart({ sdpaData, flashData }: Props) {
  // Combine data by step
  const allSteps = new Set([
    ...sdpaData.map(d => d.step),
    ...flashData.map(d => d.step)
  ]);
  const sortedSteps = Array.from(allSteps).sort((a, b) => a - b);

  const sdpaMap = new Map(sdpaData.map(d => [d.step, d.ram_usage_GB]));
  const flashMap = new Map(flashData.map(d => [d.step, d.ram_usage_GB]));

  const combinedData = sortedSteps.map(step => ({
    step,
    'SDPA Attention': sdpaMap.get(step) ?? null,
    'Flash Attention': flashMap.get(step) ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={combinedData}
        margin={{
          top: 5,
          right: 20,
          left: 40,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
        <XAxis 
          dataKey="step" 
          stroke="#9CA3AF"
          label={{ value: 'Training Step', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
          tickCount={6}
          tickFormatter={(value) => value.toString()}
        />
        <YAxis 
          stroke="#9CA3AF"
          domain={[0, 1100]}
          label={{ 
            value: 'RAM Usage', 
            angle: -90, 
            position: 'insideLeft', 
            offset: 15, 
            fill: '#9CA3AF'
          }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value: number, name: string) => {
            if (value === null) return 'N/A';
            const percentage = ((value / 1100) * 100).toFixed(2);
            return [`${value.toFixed(2)} GB (${percentage}% of system RAM)`, name];
          }}
        />
        <Legend wrapperStyle={{ color: '#D1D5DB' }} />
        <Line 
          type="monotone" 
          dataKey="SDPA Attention" 
          stroke="#F87171"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line 
          type="monotone" 
          dataKey="Flash Attention" 
          stroke="#34D399"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

