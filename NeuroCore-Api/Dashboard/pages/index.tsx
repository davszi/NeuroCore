import { useState } from 'react';
import NodeCard from '@/components/monitoring/NodeCard';
import LoginNodeCard from '@/components/dashboard/LoginNodeCard';
import { useClientMounted } from '@/hooks/useClientMounted';
import SlurmQueueTable from '@/components/dashboard/SlurmQueueTable';
import useSWR, { mutate } from 'swr';
import { ClusterState, useCluster } from '@/context/ClusterContext';

export default function RessourcesPage() {
  const { clusterState, nodesState } = useCluster();
  const isClient = useClientMounted();
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);

  async function fetchUserStorage(volume: string) {
    try {
      const res = await fetch(`/api/cluster-state?volume=${volume}`);
      const data: ClusterState = await res.json();

      // Update SWR cache for '/api/cluster-state' without refetching
      mutate('/api/cluster-state', (currentData: ClusterState | undefined) => ({
        ...currentData!,
        user_storage: data.user_storage,
      }), false);

    } catch (err) {
      console.error('Failed to fetch user storage:', err);
    }
  }

  return (
    <div className="space-y-8">
      {/* --- Header --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-3xl font-bold text-white">Ressources</h1>
        <span className="text-sm text-gray-400">
          Last updated: {isClient ? new Date(clusterState.last_updated_timestamp).toLocaleTimeString() : '...'}
        </span>
      </div>

      {/* --- 1. Idle (Slurm) Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Idle (Slurm-ressources)</h2>
        <SlurmQueueTable />
      </div>

      {/* --- 2. Nodes Section --- */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Compute Nodes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {nodesState.login_nodes?.map((node) => (
            <LoginNodeCard key={node.node_name} node={node} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {(nodesState?.gpu_nodes ?? []).map((node) => (
            <NodeCard key={node.node_name} node={node} />
          ))}
        </div>
      </div>

      {/* --- 3. Storage Section --- */}
<div className="p-4 bg-gray-900 rounded-lg shadow-md border border-gray-700">
  <h2 className="text-2xl font-semibold text-white mb-4">Storage</h2>

  {/* Filesystem Volumes */}
  <h3 className="text-lg font-semibold text-white mb-3">Filesystem Volumes</h3>
  <div className="flex gap-4 mb-6">
    {clusterState.storage.map((volume) => (
      <div key={volume.mount_point} className="flex-1">
        {/* Volume label */}
        <div className="flex justify-between mb-1 text-sm text-gray-300">
          <span>{volume.mount_point}</span>
          <span>{volume.usage_percent}% of {volume.total_tib} TiB</span>
        </div>

        {/* Animated usage bar */}
        <div
          className="w-full h-3 bg-gray-800 rounded-lg overflow-hidden relative cursor-pointer"
          onClick={() => {
            setSelectedVolume(volume.mount_point);
            fetchUserStorage(volume.mount_point);
          }}
        >
          <div
            className="h-full bg-yellow-400 transition-all duration-1000 ease-out"
            style={{ width: `${volume.usage_percent}%` }}
          ></div>
        </div>
      </div>
    ))}
  </div>

  {/* User Storage Table / Permission Message */}
  {selectedVolume && (
    <div className="mt-4">
      {(selectedVolume === '/home' || selectedVolume === '/windows-home') ? (
        <p className="text-red-400">
          You don't have permission to access individual user storage for {selectedVolume}.
        </p>
      ) : clusterState.user_storage?.length ? (
        <div className="max-h-96 overflow-y-auto border border-gray-700 rounded-lg p-4 bg-gray-900">
          <h3 className="text-lg font-semibold text-white mb-3">
            User Storage: {selectedVolume}
          </h3>
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Username</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Used Storage (GiB)</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Total Files</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-800">
              {clusterState.user_storage
                .filter((u) => u.mount_point === selectedVolume)
                .map((user) => (
                  <tr key={user.username} className="hover:bg-gray-800">
                    <td className="px-4 py-2 text-cyan-300">{user.username}</td>
                    <td className="px-4 py-2">{user.used_storage_space_gb.toFixed(2)}</td>
                    <td className="px-4 py-2">{user.total_files.toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400">No user storage data available for this volume.</p>
      )}
    </div>
  )}
</div>

    </div>
  );
}