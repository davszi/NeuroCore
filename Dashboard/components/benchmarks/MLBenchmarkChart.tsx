import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrainingData {
  step: number;
  loss: number;
}
interface Props {
  baselineData: TrainingData[];
  flashData: TrainingData[];
}

export default function MLBenchmarkChart({ baselineData, flashData }: Props) {

  const allSteps = new Set([
    ...baselineData.map(d => d.step),
    ...flashData.map(d => d.step)
  ]);
  
  const sortedSteps = Array.from(allSteps).sort((a, b) => a - b);

  const baselineMap = new Map(baselineData.map(d => [d.step, d.loss]));
  const flashMap = new Map(flashData.map(d => [d.step, d.loss]));

  const combinedData = sortedSteps.map(step => ({
    step,
    'SDPA Attention': baselineMap.get(step) ?? null,
    'Flash Attention': flashMap.get(step) ?? null,
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
        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" /> {/* Darker grid */}
        <XAxis 
          dataKey="step" 
          stroke="#9CA3AF" // Light gray text
          label={{ value: 'Step', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
        />
        <YAxis 
          stroke="#9CA3AF" 
          domain={['dataMin - 0.05', 'dataMax + 0.05']} // Auto-scaling Y-axis
          label={{ value: 'Loss', angle: -90, position: 'insideLeft', offset: 20, fill: '#9CA3AF' }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }}
          labelStyle={{ color: '#F9FAFB' }}
          formatter={(value: number) => value !== null ? value.toFixed(4) : 'N/A'}
        />
        <Legend wrapperStyle={{ color: '#D1D5DB' }} />
        <Line 
          type="monotone" 
          dataKey="SDPA Attention" 
          stroke="#F87171" // Reddish
          strokeWidth={2}
          dot={false}
        />
        <Line 
          type="monotone" 
          dataKey="Flash Attention" 
          stroke="#34D399" // Greenish
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}