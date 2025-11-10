import React from 'react';
import ProgressBar from '../ui/ProgressBar'; //  reusing our progress bar
import { HiUsers } from 'react-icons/hi'; // icon for users

// 1. 🧠 Define the type for the data this component expects.
//    This matches the 'LoginNode' interface in your ClusterContext.tsx
interface LoginNode {
  node_name: string;
  cores_total: number;
  mem_total_gb: number;
  cpu_util_percent: number;
  mem_util_percent: number;
  active_users: number;
}

// 2. 🎁 Define the props for our component
interface LoginNodeCardProps {
  node: LoginNode;
}

// 3. 🖥️ Create the component
export default function LoginNodeCard({ node }: LoginNodeCardProps) {
  return (
    <div className="bg-gray-900 shadow-lg rounded-lg p-4 border border-gray-700">
      
      {/* --- Header --- */}
      <div className="mb-3">
        <h3 className="text-lg font-bold text-white">{node.node_name}</h3>
        <p className="text-xs text-gray-400">
          {node.cores_total} Cores, {node.mem_total_gb}GB MEM
        </p>
      </div>

      {/* --- Progress Bars --- */}
      <div className="space-y-3 mb-4">
        {/* We can reuse the same ProgressBar component we use for GPUs! */}
        <ProgressBar label="CPU" value={node.cpu_util_percent} />
        <ProgressBar label="MEM" value={node.mem_util_percent} />
      </div>

      {/* --- Active Users --- */}
      <div className="flex items-center text-sm text-gray-300">
        <HiUsers className="w-4 h-4 mr-2 text-gray-400" />
        <span>
          {node.active_users} Active User{node.active_users !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}