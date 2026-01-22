import React, { useState } from 'react';
import ProgressBar from '../ui/ProgressBar';
import { HiUsers, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { LoginNode } from '@/types/cluster'; // Import shared type

interface LoginNodeCardProps {
  node: LoginNode;
}

export default function LoginNodeCard({ node }: LoginNodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOffline = node.is_reachable === false; // Check the flag

  return (
    <div 
      className={`shadow-lg rounded-lg p-4 border transition-all duration-300 ${
        isOffline 
          ? "bg-gray-900/50 border-red-900/50 opacity-75 grayscale" 
          : "bg-gray-900 border-gray-700"
      }`}
    >
      {/* --- Header --- */}
      <div className="mb-3 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            {node.node_name}
            {isOffline && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-400 border border-red-900 uppercase tracking-wider">
                Offline
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-400">
            {node.cores_total} Cores, {node.mem_total_gb}GB MEM
          </p>
        </div>
      </div>

      {/* --- Util Bars --- */}
      <div className="space-y-3 mb-4">
        <ProgressBar label="CPU" value={node.cpu_util_percent} />
        <ProgressBar label="MEM" value={node.mem_util_percent} />
      </div>

      {/* ... Keep the User Count section same as before ... */}
       <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-sm text-gray-300 hover:text-white transition"
      >
        <div className="flex items-center">
          <HiUsers className="w-4 h-4 mr-2 text-gray-400" />
          <span>
            {node.active_users} Active User{node.active_users !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded ? <HiChevronUp /> : <HiChevronDown />}
      </button>

      {expanded && node.active_usernames?.length > 0 && (
          <div className="mt-3 bg-gray-800 p-3 rounded-lg border border-gray-700">
             {/* ... existing user list code ... */}
             <ul className="space-y-1 text-sm text-cyan-300">
              {node.active_usernames.map((user) => (
                <li key={user}>• {user}</li>
              ))}
            </ul>
          </div>
      )}
    </div>
  );
}