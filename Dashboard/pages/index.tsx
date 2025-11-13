import { useCluster } from '@/context/ClusterContext';
import NodeCard from '@/components/monitoring/NodeCard';
import LoginNodeCard from '@/components/dashboard/LoginNodeCard'; // We already built this
import { useClientMounted } from '@/hooks/useClientMounted';
import SlurmQueueTable from '@/components/dashboard/SlurmQueueTable';
import StorageVolumeCard from '@/components/dashboard/StorageVolumeCard';
import UserStorageTable from '@/components/dashboard/UserStorageTable';

export default function RessourcesPage() {
  const { clusterState, nodesState } = useCluster();
  const isClient = useClientMounted();

  return (
    <div className="space-y-8">

      {/* --- Header --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-3xl font-bold text-white">Ressources</h1>
        <span className="text-sm text-gray-400">
          Last updated: 
          {isClient ? new Date(clusterState.last_updated_timestamp).toLocaleTimeString() : '...'}
        </span>
      </div>

      {/* --- 1. Idle (Slurm) Section --- */}
      {/* --- 1. Idle (Slurm) Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          Idle (Slurm-ressources)
        </h2>
        {/* ✅ --- We've replaced the placeholder with our new component --- ✅ */}
        <SlurmQueueTable /> 
      </div>

      {/* --- 2. Nodes Section (Already built!) --- */}
      <div>
        
        {/* We can re-use the LoginNodeCard component for our Login Nodes */}
        <h3 className="text-lg font-semibold text-white mb-3">Login Nodes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {nodesState.login_nodes.map((node) => (
            <LoginNodeCard key={node.node_name} node={node} />
          ))}
        </div>

        {/* And the NodeCard component for our GPU Compute Nodes */}
        <h3 className="text-lg font-semibold text-white mb-3">Compute Nodes</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {nodesState.gpu_nodes.map((node) => (
            <NodeCard key={node.node_name} node={node} />
          ))}
        </div>
      </div>

      {/* --- 3. Storage Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          Storage
        </h2>
        
        {/* ✅ --- Filesystem Volumes --- ✅ */}
        <h3 className="text-lg font-semibold text-white mb-3">Filesystem Volumes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* We map over the 'storage' array from the API */}
          {clusterState.storage.map((volume) => (
            <StorageVolumeCard key={volume.mount_point} volume={volume} />
          ))}
        </div>

        {/* ✅ --- User Storage --- ✅ */}
        <h3 className="text-lg font-semibold text-white mb-3">User Storage</h3>
        <UserStorageTable />
      </div>

    </div>
  );
}