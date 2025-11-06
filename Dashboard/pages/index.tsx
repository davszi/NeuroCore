import { useCluster } from '@/context/ClusterContext';
import NodeCard from '@/components/monitoring/NodeCard';
import { useClientMounted } from '@/hooks/useClientMounted'; // 1. Import the hook

export default function DashboardPage() {
  const { clusterState } = useCluster();
  const isClient = useClientMounted(); // 2. Use the hook

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        {/* ... (other spans for power, etc.) ... */}
        <span className="text-sm text-gray-400">
          Last updated: 
          {/* 3. Only render the time if we are on the client */}
          {isClient ? new Date(clusterState.last_updated_timestamp).toLocaleTimeString() : '...'}
        </span>
      </div>
    
      {/* GPU Node Overview Section */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          GPU Node Overview
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {clusterState.gpu_nodes.map((node) => (
            <NodeCard key={node.node_name} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}