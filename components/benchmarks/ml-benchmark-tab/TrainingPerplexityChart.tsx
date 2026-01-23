import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface RunMeta {
  id: string;
  display: string;
  color: string;
}

interface Props {
  data: any[];
  runs: RunMeta[];
}

// Helper: Switch to scientific notation for large values (>= 1000)
// Example: 10000 -> 1.0e+4, but 12.5 -> 12.50
const formatPerplexity = (val: number) => {
    if (typeof val !== 'number') return val;
    if (val >= 1000) return val.toExponential(1); 
    return val.toFixed(2); 
};

export default function TrainingPerplexityChart({ data, runs }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 h-80 shadow-lg">
      <h3 className="text-gray-300 font-bold mb-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
        Perplexity (Log Scale)
      </h3>
      
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm animate-pulse">
            Waiting for metrics...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="step" 
                stroke="#9CA3AF" 
                tick={{ fontSize: 12 }}
                label={{ value: 'Step', position: 'insideBottom', offset: -5, fill: '#6B7280', fontSize: 10 }}
              />
              <YAxis 
                stroke="#9CA3AF" 
                scale="log"
                domain={['auto', 'auto']}
                tick={{ fontSize: 12 }}
                tickFormatter={formatPerplexity} // FIX: Apply formatting to axis
                width={55} // Slightly wider to fit "1.0e+5"
                allowDataOverflow
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '4px' }}
                labelStyle={{ color: '#9CA3AF', marginBottom: '0.25rem' }}
                formatter={(value: number, name: string) => [
                    formatPerplexity(value), // FIX: Apply formatting to tooltip
                    name
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }} />

              {runs.map(run => (
                <Line 
                  key={run.id}
                  type="monotone" 
                  dataKey={`perplexity_${run.id}`} 
                  name={run.display}
                  stroke={run.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}