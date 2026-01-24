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

export default function LearningRateChart({ data, runs }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 h-80 shadow-lg">
      <h3 className="text-gray-300 font-bold mb-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
        Learning Rate Schedule
      </h3>
      
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
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
              />
              <YAxis 
                stroke="#9CA3AF" 
                tick={{ fontSize: 12 }}
                tickFormatter={(val) => val.toExponential(1)}
                width={60} // Extra wide for scientific notation (e.g., 5.0e-5)
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value: number, name: string) => [
                    typeof value === 'number' ? value.toExponential(2) : value, 
                    name
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px', cursor: 'pointer' }} />

              {runs.map(run => (
                <Line 
                  key={run.id}
                  type="monotone" 
                  dataKey={`lr_${run.id}`} 
                  name={run.display}
                  stroke={run.color}
                  strokeWidth={2}
                  dot={false}
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