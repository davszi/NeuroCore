import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Define the shape of the data props
interface TrainingData {
  step: number;
  loss: number;
}
interface Props {
  baselineData: TrainingData[];
  flashData: TrainingData[];
}

export default function MLBenchmarkChart({ baselineData, flashData }: Props) {
  
  // Combine the two data sources into one array for the chart
  const combinedData = baselineData.map((d, i) => ({
    step: d.step,
    Baseline: d.loss,
    'Flash Attention': flashData[i].loss,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={combinedData}
        margin={{
          top: 5,
          right: 20,
          left: -10, // Move Y-axis labels closer
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
          label={{ value: 'Loss', angle: -90, position: 'insideLeft', offset: 10, fill: '#9CA3AF' }}
        />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} // Dark tooltip
          labelStyle={{ color: '#F9FAFB' }} // White label
        />
        <Legend wrapperStyle={{ color: '#D1D5DB' }} />
        <Line 
          type="monotone" 
          dataKey="Baseline" 
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