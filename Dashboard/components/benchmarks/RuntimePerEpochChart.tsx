import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface RuntimeEntry {
  epoch: number;
  runtime_seconds: number;
}

interface Props {
  sdpaRuntime: RuntimeEntry[];
  flashRuntime: RuntimeEntry[];
}

export default function RuntimePerEpochChart({ sdpaRuntime, flashRuntime }: Props) {
  // Combine data by epoch
  const allEpochs = new Set([
    ...sdpaRuntime.map(d => d.epoch),
    ...flashRuntime.map(d => d.epoch)
  ]);
  const sortedEpochs = Array.from(allEpochs).sort((a, b) => a - b);

  const sdpaMap = new Map(sdpaRuntime.map(d => [d.epoch, d.runtime_seconds]));
  const flashMap = new Map(flashRuntime.map(d => [d.epoch, d.runtime_seconds]));

  const combinedData = sortedEpochs.map(epoch => ({
    epoch,
    'SDPA Attention': sdpaMap.get(epoch) ?? null,
    'Flash Attention': flashMap.get(epoch) ?? null,
  }));

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
          dataKey="epoch" 
          stroke="#9CA3AF"
          label={{ value: 'Epoch', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
        />
        <YAxis 
          stroke="#9CA3AF"
          label={{ value: 'Runtime (seconds)', angle: -90, position: 'insideLeft', offset: 20, fill: '#9CA3AF' }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value: number) => value !== null ? `${value.toFixed(2)}s` : 'N/A'}
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

