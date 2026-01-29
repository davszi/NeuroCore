import React from 'react';
import ProgressBar from '../ui/ProgressBar';

interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_used_mib: number;  
  memory_total_mib: number; 
  temperature_celsius: number;
  power_draw_watts: number; 
  power_limit_watts: number;
}

interface GpuCardProps {
  gpu: Gpu;
}

export default function GpuCard({ gpu }: GpuCardProps) {
  
  const memory_util_percent = (gpu.memory_total_mib > 0)
    ? (gpu.memory_used_mib / gpu.memory_total_mib) * 100
    : 0;

  return (
    <div className="bg-gray-800 p-3 rounded-md border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-white">
          GPU {gpu.gpu_id}: {gpu.gpu_name}
        </span>
        <span className="text-xs text-gray-400">
          {/* Use 'power_draw_watts' which matches the API */}
          {gpu.temperature_celsius}°C / {gpu.power_draw_watts}W
        </span>
      </div>

      <div className="space-y-3">
        <ProgressBar label="GPU" value={gpu.utilization_percent} />
        {/* 3. Pass our calculated percentage to the ProgressBar */}
        <ProgressBar label="VRAM" value={memory_util_percent} />
      </div>
    </div>
  );
}