import React from 'react';
import GpuCard from './GpuCard';
import ProgressBar from '../ui/ProgressBar';

// Simplified Node interface from our context
interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;
  gpus: Array<{
    gpu_id: number;
    gpu_name: string;
    utilization_percent: number;
    memory_util_percent: number;
    temperature_celsius: number;
    power_watts: number;
    power_limit_watts: number;
  }>;
}

interface NodeCardProps {
  node: GpuNode;
}

export default function NodeCard({ node }: NodeCardProps) {
  return (
    <div className="bg-gray-900 shadow-lg rounded-lg p-4 border border-gray-700">
      {/* Node Header */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-white">{node.node_name}</h3>
        <p className="text-sm text-gray-400">
          {node.gpu_summary_name} ({node.cores_total} Cores, {node.mem_total_gb}GB MEM)
        </p>
      </div>

      {/* System Metrics */}
      <div className="space-y-3 mb-4">
        <ProgressBar label="CPU" value={node.cpu_util_percent} />
        <ProgressBar label="MEM" value={node.mem_util_percent} />
      </div>

      {/* GPU Cards */}
      <div className="space-y-2">
        {node.gpus.map((gpu) => (
          <GpuCard key={gpu.gpu_id} gpu={gpu} />
        ))}
      </div>
    </div>
  );
}