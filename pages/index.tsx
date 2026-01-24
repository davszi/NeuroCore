import React, { useState } from 'react';
import useSWR from 'swr';
import { useCluster } from '@/context/ClusterContext';
import { useClientMounted } from '@/hooks/useClientMounted';
import Head from 'next/head';
import { CLUSTER_NODES } from '@/lib/config';

import SlurmQueueTable from '@/components/dashboard/SlurmQueueTable';
import LoginNodeCard from '@/components/dashboard/LoginNodeCard';
import NodeCard from '@/components/monitoring/NodeCard';
import StorageVolumeCard from '@/components/dashboard/StorageVolumeCard';
import UserStorageTable from '@/components/dashboard/UserStorageTable';

export default function ResourcesPage() {
  const { clusterState, nodesState, isLoading } = useCluster();
  const isClient = useClientMounted();
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string>(CLUSTER_NODES[0]?.name || 'cloud-243');

  // Fetch storage volumes for the selected node specifically
  const { data: nodeStorageData, error: nodeStorageError, isLoading: isNodeStorageLoading } = useSWR(
    selectedNode ? `/api/cluster-state?node=${selectedNode}` : null,
    (url) => fetch(url).then(r => r.json()),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    }
  );

  const displayVolumes = nodeStorageData?.storage || [];
  const isVolumesLoading = isNodeStorageLoading;

  const lastUpdatedLabel = React.useMemo(() => {
    if (!isClient) return '...';
    if (!clusterState?.last_updated_timestamp) return 'Never';
    return new Date(clusterState.last_updated_timestamp).toLocaleTimeString();
  }, [clusterState, isClient]);

  return (
    <>
      <Head>
        <title>Cluster Resources | Dashboard</title>
      </Head>

      <div className="space-y-8 p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h1 className="text-3xl font-bold text-white">Resources</h1>
          <div className="flex items-center gap-2">
            {isLoading && <span className="text-yellow-400 text-xs animate-pulse">Syncing...</span>}
            <span className="text-sm text-gray-400">
              Last updated: <span className="text-cyan-300 font-mono">{lastUpdatedLabel}</span>
            </span>
          </div>
        </div>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">Idle (Slurm-resources)</h2>
          <SlurmQueueTable />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-white mb-3">Compute Nodes</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {(nodesState?.login_nodes || []).map((node) => (
              <LoginNodeCard key={node.node_name} node={node} />
            ))}
          </div>

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

        <section className="p-4 bg-gray-900 rounded-lg shadow-md border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">Storage</h2>
              <p className="text-sm text-gray-400">View filesystems and user usage per node</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-300">Nodes:</span>
              <select
                value={selectedNode}
                onChange={(e) => {
                  setSelectedNode(e.target.value);
                  setSelectedVolume(null);
                }}
                className="bg-gray-800 text-white text-sm border border-gray-700 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-cyan-500 outline-none hover:border-gray-500 transition-colors shadow-sm"
              >
                {CLUSTER_NODES.map((node) => (
                  <option key={node.name} value={node.name}>
                    {node.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-white mb-3">
            Filesystem Volumes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {isVolumesLoading ? (
              // Shimmering Skeletons
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-800/50 h-24 rounded-lg animate-pulse border border-gray-700/50 flex flex-col p-4 justify-between">
                    <div className="h-4 w-1/3 bg-gray-700 rounded mb-2"></div>
                    <div className="h-3 w-1/2 bg-gray-700 rounded"></div>
                    <div className="h-2 w-full bg-gray-700 rounded mt-4"></div>
                  </div>
                ))}
              </>
            ) : (nodeStorageError || nodeStorageData?.error) ? (
              <div className="col-span-full p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-sm">
                <p className="font-bold">Fetch Failed</p>
                <p>Could not connect to {selectedNode} to scan storage. User may be offline or SSH session failed.</p>
              </div>
            ) : displayVolumes.length > 0 ? (
              displayVolumes.map((volume: any) => (
                <div
                  key={volume.mount_point}
                  onClick={() => setSelectedVolume(volume.mount_point)}
                  className={`cursor-pointer transition-transform transform hover:scale-[1.01] ${selectedVolume === volume.mount_point ? 'ring-2 ring-cyan-500 rounded-lg' : ''}`}
                >
                  <StorageVolumeCard volume={volume} />
                </div>
              ))
            ) : (
              <div className="col-span-full py-6 text-center text-gray-600 border border-dashed border-gray-800 rounded-lg">
                No volumes detected on {selectedNode}
              </div>
            )}
          </div>

          {selectedVolume && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
              {((selectedVolume === '/home' || selectedVolume === '/windows-home') &&
                !['cloud-202', 'cloud-203', 'cloud-204', 'cloud-205'].includes(selectedNode)) ? (
                <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-200">
                  <span className="font-bold">Access Denied:</span> You don&apos;t have permission to access individual user storage for {selectedVolume} on this node.
                </div>
              ) : (
                <UserStorageTable selectedVolume={selectedVolume} selectedNode={selectedNode} />
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}