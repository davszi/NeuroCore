import React from "react";
import { useCluster } from "@/context/ClusterContext";
import { HiOutlineRefresh } from "react-icons/hi";

export default function SlurmQueueTable() {
  const { clusterState, isStateLoading, stateError } = useCluster();

  const renderCell = (value: number | null | undefined) => (value ?? "-");

  const slurmQueue = clusterState?.slurm_queue_info ?? [];

  if (isStateLoading && !stateError) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-900 rounded-lg border border-gray-700">
        <HiOutlineRefresh className="w-5 h-5 animate-spin mr-2" />
        <span>Loading SLURM data...</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          {/* Table Header */}
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

          {/* Table Body */}
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {slurmQueue.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-4 text-gray-400">
                  No SLURM queue data available.
                </td>
              </tr>
            ) : (
              slurmQueue.map((partition) => (
                <tr key={partition.partition} className="hover:bg-gray-800">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-cyan-300">
                    {partition.partition}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {renderCell(partition.cpu_free)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {renderCell(partition.cpu_allocated)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {(() => {
                      const total = (partition.mem_free_gb || 0) + (partition.mem_allocated_gb || 0);
                      const percent = total > 0 ? ((partition.mem_free_gb / total) * 100).toFixed(1) : "0.0";
                      return `${partition.mem_free_gb} GB (${percent}%)`;
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">
                    {(() => {
                      const total = (partition.mem_free_gb || 0) + (partition.mem_allocated_gb || 0);
                      const percent = total > 0 ? ((partition.mem_allocated_gb / total) * 100).toFixed(1) : "0.0";
                      return `${partition.mem_allocated_gb} GB (${percent}%)`;
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-green-400">
                    {renderCell(partition.gpu_free)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-400">
                    {renderCell(partition.gpu_allocated)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}