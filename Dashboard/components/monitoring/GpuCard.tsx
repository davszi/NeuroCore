import React from 'react';
import ProgressBar from '../ui/ProgressBar';

// Simplified Gpu interface from our context
interface Gpu {
  gpu_id: number;
  gpu_name: string;
  utilization_percent: number;
  memory_util_percent: number;
  temperature_celsius: number;
  power_watts: number;
  power_limit_watts: number;
}

interface GpuCardProps {
  gpu: Gpu;
}

export default function GpuCard({ gpu }: GpuCardProps) {
  return (
    <div className="bg-gray-800 p-3 rounded-md border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-white">
          GPU {gpu.gpu_id}: {gpu.gpu_name}
        </span>
        <span className="text-xs text-gray-400">
          {gpu.temperature_celsius}°C / {gpu.power_watts}W
        </span>
      </div>

      <div className="space-y-3">
        <ProgressBar label="GPU" value={gpu.utilization_percent} />
        <ProgressBar label="VRAM" value={gpu.memory_util_percent} />
      </div>
    </div>
  );
}