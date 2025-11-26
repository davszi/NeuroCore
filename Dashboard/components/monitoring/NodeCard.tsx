import React, { useState } from 'react';
import GpuCard from './GpuCard';
import ProgressBar from '../ui/ProgressBar';
import { HiUsers, HiChevronDown, HiChevronUp } from 'react-icons/hi';

interface GpuNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  gpu_summary_name: string;

  active_users: number;
  active_usernames: string[];

  gpus: Array<{
    gpu_id: number;
    gpu_name: string;
    utilization_percent: number;
    memory_used_mib: number;
    memory_total_mib: number;
    temperature_celsius: number;
    power_draw_watts: number;
    power_limit_watts: number;
  }>;
}

interface NodeCardProps {
  node: GpuNode; 
}

export default function NodeCard({ node }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-900 shadow-lg rounded-lg p-4 border border-gray-700">
      
      {/* --- Node Header --- */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-white">{node.node_name}</h3>
        <p className="text-sm text-gray-400">
          {node.gpu_summary_name} ({node.cores_total} Cores, {node.mem_total_gb}GB MEM)
        </p>
      </div>

      {/* --- System Metrics --- */}
      <div className="space-y-3 mb-4">
        <ProgressBar label="CPU" value={node.cpu_util_percent} />
        <ProgressBar label="MEM" value={node.mem_util_percent} />
      </div>

      {/* --- GPU Cards --- */}
      <div className="space-y-2 mb-4">
        {node.gpus.map((gpu) => (
          <GpuCard key={gpu.gpu_id} gpu={gpu} />
        ))}
      </div>

      {/* --- Active Users (Clickable) with Chevron at End --- */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white transition mb-3"
      >
        <div className="flex items-center">
          <HiUsers className="w-4 h-4 mr-2" />
          <span>
            {node.active_users} Active User{node.active_users !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded ? (
          <HiChevronUp className="w-4 h-4" />
        ) : (
          <HiChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* --- Expandable Username List --- */}
      {expanded && node.active_usernames?.length > 0 && (
        <div className="mb-4 bg-gray-800 p-3 rounded-lg border border-gray-700">
          <h4 className="text-xs font-semibold text-gray-400 mb-2">Logged-in users:</h4>
          <ul className="space-y-1 text-sm text-cyan-300">
            {node.active_usernames.map((user) => (
              <li key={user}>• {user}</li>
            ))}
          </ul>
        </div>
      )}

      {expanded && node.active_usernames?.length === 0 && (
        <p className="mb-3 text-xs text-gray-500">No users currently logged in.</p>
      )}

    </div>
  );
}
