import React, { useState } from 'react';
import { useCluster } from '@/context/ClusterContext';
import { useClientMounted } from '@/hooks/useClientMounted'; // Assuming you still have this hook
import Head from 'next/head';

// Components
import SlurmQueueTable from '@/components/dashboard/SlurmQueueTable';
import LoginNodeCard from '@/components/dashboard/LoginNodeCard';
import NodeCard from '@/components/monitoring/NodeCard';
import StorageVolumeCard from '@/components/dashboard/StorageVolumeCard';
import UserStorageTable from '@/components/dashboard/UserStorageTable';

export default function ResourcesPage() {
  const { clusterState, nodesState, isLoading } = useCluster();
  const isClient = useClientMounted();
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);

  // Helper to format the "Last Updated" time
  const lastUpdatedLabel = React.useMemo(() => {
    if (!isClient) return '...';
    if (!clusterState?.last_updated_timestamp) return 'Never';
    return new Date(clusterState.last_updated_timestamp).toLocaleTimeString();
  }, [clusterState, isClient]);

  // Determine if we are using stale data (Preview) or live data
  // You can add a visual indicator here if you want (e.g. "Offline Mode" vs "Live")
  
  return (
    <>
      <Head>
        <title>Cluster Resources | Dashboard</title>
      </Head>

      <div className="space-y-8 p-6">
        {/* --- Header --- */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h1 className="text-3xl font-bold text-white">Resources</h1>
          <div className="flex items-center gap-2">
             {isLoading && <span className="text-yellow-400 text-xs animate-pulse">Syncing...</span>}
             <span className="text-sm text-gray-400">
               Last updated: <span className="text-cyan-300 font-mono">{lastUpdatedLabel}</span>
             </span>
          </div>
        </div>

        {/* --- 1. Idle (Slurm) Section --- */}
        <section>
          {/* <h2 className="text-2xl font-semibold text-white mb-4">Idle (Slurm-resources)</h2> */}
          {/* <SlurmQueueTable /> */}
        </section>

        {/* --- 2. Nodes Section --- */}
        <section>
          <h3 className="text-lg font-semibold text-white mb-3">Compute Nodes</h3>
          
          {/* Login Nodes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {(nodesState?.login_nodes || []).map((node) => (
              <LoginNodeCard key={node.node_name} node={node} />
            ))}
          </div>

          {/* GPU Nodes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {(nodesState?.gpu_nodes || []).map((node) => (
              <NodeCard key={node.node_name} node={node} />
            ))}
          </div>
          
          {nodesState?.gpu_nodes?.length === 0 && !isLoading && (
            <div className="text-center p-8 bg-gray-900 rounded-lg border border-gray-800 text-gray-400">
              No GPU nodes found or system is initializing.
            </div>
          )}
        </section>

        {/* --- 3. Storage Section --- */}
        <section className="p-4 bg-gray-900 rounded-lg shadow-md border border-gray-700">
          <h2 className="text-2xl font-semibold text-white mb-4">Storage</h2>

          {/* Filesystem Volumes */}
          <h3 className="text-lg font-semibold text-white mb-3">Filesystem Volumes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {(clusterState?.storage || []).map((volume) => (
              <div 
                key={volume.mount_point}
                onClick={() => setSelectedVolume(volume.mount_point)}
                className={`cursor-pointer transition-transform transform hover:scale-[1.01] ${selectedVolume === volume.mount_point ? 'ring-2 ring-cyan-500 rounded-lg' : ''}`}
              >
                <StorageVolumeCard volume={volume} />
              </div>
            ))}
          </div>

          {/* User Storage Table */}
          {selectedVolume && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
              {(selectedVolume === '/home' || selectedVolume === '/windows-home') ? (
                <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-200">
                  <span className="font-bold">Access Denied:</span> You don't have permission to access individual user storage for {selectedVolume}.
                </div>
              ) : (
                <UserStorageTable selectedVolume={selectedVolume} />
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}