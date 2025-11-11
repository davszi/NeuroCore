import React from 'react';
import { useCluster } from '@/context/ClusterContext';
import { HiOutlineRefresh } from 'react-icons/hi';

// 1. 🧠 Define the type for the Slurm data.
//    This matches the 'SlurmPartition' interface in your ClusterContext.tsx
interface SlurmPartition {
  partition: string;
  cpu_free: number | null;
  cpu_allocated: number | null;
  gpu_free: number | null;
  gpu_allocated: number | null;
  mem_free_gb: number;
  mem_allocated_gb: number;
}

// 2. 🖥️ Create the component
export default function SlurmQueueTable() {
  // 3. 🎁 Get the data and loading state from the context
  const { clusterState, isStateLoading, stateError } = useCluster();

  // Helper function to render a cell, showing '-' for null/undefined
  const renderCell = (value: number | string | null | undefined) => {
    return value === null || value === undefined ? '-' : value;
  };

  // 4. ⏳ Show a loading state while SWR is fetching
  if (isStateLoading && !stateError) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-900 rounded-lg border border-gray-700">
        <HiOutlineRefresh className="w-5 h-5 animate-spin mr-2" />
        <span>Loading SLURM data...</span>
      </div>
    );
  }

  // 5. 📊 Render the table with the data
  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          
          {/* --- Table Header --- */}
          <thead className="bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Partition</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">CPU Free</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">CPU Allocated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">MEM [GB] Free</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">MEM [GB] Allocated</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">GPU Free</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">GPU Allocated</th>
            </tr>
          </thead>

          {/* --- Table Body --- */}
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {clusterState.slurm_queue_info.map((partition) => (
              <tr key={partition.partition} className="hover:bg-gray-800">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-cyan-300">{partition.partition}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{renderCell(partition.cpu_free)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{renderCell(partition.cpu_allocated)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{renderCell(partition.mem_free_gb)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{renderCell(partition.mem_allocated_gb)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-green-400">{renderCell(partition.gpu_free)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-400">{renderCell(partition.gpu_allocated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}