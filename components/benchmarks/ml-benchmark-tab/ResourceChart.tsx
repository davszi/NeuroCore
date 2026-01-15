import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  data: any[];
}

export default function ResourceChart({ data }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 h-80 shadow-lg">
      <h3 className="text-gray-300 font-bold mb-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500"></div>
        Resource Usage (Step-wise)
      </h3>
      
      <div className="h-64 w-full">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Waiting for metrics...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} width={40} unit="GB" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }}
                labelStyle={{ color: '#9CA3AF' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }}/>
              
              <Area 
                type="monotone" 
                dataKey="gpu_mem_GB" 
                name="GPU Memory"
                stroke="#10B981" 
                fill="#10B981" 
                fillOpacity={0.1}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area 
                type="monotone" 
                dataKey="ram_usage_GB" 
                name="Sys RAM"
                stroke="#6366F1" 
                fill="#6366F1" 
                fillOpacity={0.1}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}