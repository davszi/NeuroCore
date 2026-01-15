import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: any[];
}

export default function TrainingLossChart({ data }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 h-80 shadow-lg">
      <h3 className="text-gray-300 font-bold mb-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
        Training Loss
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
                domain={['auto', 'auto']}
                tick={{ fontSize: 12 }}
                width={40}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '4px' }}
                itemStyle={{ color: '#22D3EE' }}
                formatter={(value: number) => [value.toFixed(4), 'Loss']}
                labelStyle={{ color: '#9CA3AF', marginBottom: '0.25rem' }}
              />
              <Line 
                type="monotone" 
                dataKey="loss" 
                stroke="#22D3EE" // Cyan
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}