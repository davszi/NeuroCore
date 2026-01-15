import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: any[];
}

export default function LearningRateChart({ data }: Props) {
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
                tickFormatter={(val) => val.toExponential(1)} // Scientific notation for small LR
                width={50}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                itemStyle={{ color: '#EAB308' }}
                formatter={(value: number) => [value.toExponential(2), 'LR']}
                labelStyle={{ color: '#9CA3AF' }}
              />
              <Line 
                type="monotone" 
                dataKey="learning_rate" 
                stroke="#EAB308" // Yellow
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}