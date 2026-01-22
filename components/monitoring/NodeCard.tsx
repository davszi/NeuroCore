import React, { useState } from 'react';
import GpuCard from './GpuCard';
import ProgressBar from '../ui/ProgressBar';
import { HiUsers, HiChevronDown, HiChevronUp, HiServer, HiChip } from 'react-icons/hi';
import { GpuNode } from '@/types/cluster';

interface NodeCardProps {
  node: GpuNode;
}

export default function NodeCard({ node }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOffline = node.is_reachable === false;

  return (
    <div 
      className={`shadow-lg rounded-lg p-4 border transition-all duration-300 ${
        isOffline 
          ? "bg-gray-900/50 border-red-900/50 opacity-75 grayscale" 
          : "bg-gray-900 border-gray-700"
      }`}
    >
      {/* --- Header --- */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <HiServer className={isOffline ? "text-red-400" : "text-gray-400"} />
            {node.node_name}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
             {node.cores_total} Cores, {node.mem_total_gb}GB RAM
          </p>
        </div>
        <div className="text-right">
           <span className="flex items-center gap-1 text-xs font-mono text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded border border-cyan-900">
              <HiChip className="w-3 h-3" />
              {node.gpus.length} x {node.gpu_summary_name}
           </span>
           {isOffline && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-400 border border-red-900 uppercase tracking-wider">
                Offline
              </span>
            )}
        </div>
      </div>

      {/* --- System Resources --- */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <ProgressBar label="CPU" value={node.cpu_util_percent} />
        <ProgressBar label="RAM" value={node.mem_util_percent} />
      </div>

      {/* --- GPU Grid --- */}
      <div className="space-y-3 mb-4">
        {node.gpus.map((gpu) => (
          <GpuCard key={gpu.gpu_id} gpu={gpu} />
        ))}
      </div>

      {/* --- Active Users --- */}
      <div className="border-t border-gray-800 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-sm text-gray-300 hover:text-white transition group"
        >
          <div className="flex items-center">
            <HiUsers className="w-4 h-4 mr-2 text-gray-500 group-hover:text-cyan-400 transition-colors" />
            <span>
              {node.active_users} Active User{node.active_users !== 1 ? 's' : ''}
            </span>
          </div>
          {expanded ? <HiChevronUp /> : <HiChevronDown />}
        </button>

        {expanded && node.active_usernames?.length > 0 && (
          <div className="mt-3 bg-gray-950/50 p-3 rounded border border-gray-800">
            <ul className="space-y-1 text-sm font-mono text-cyan-300">
              {node.active_usernames.map((user) => (
                <li key={user} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                    {user}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}