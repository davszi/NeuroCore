import NodeCard from '@/components/monitoring/NodeCard';
import { useCluster } from '@/context/ClusterContext';

export default function MonitoringPage() {
  const { clusterState } = useCluster();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">GPU Node Monitoring</h1>
        <span className="text-sm text-gray-400">
          Last updated: {new Date(clusterState.last_updated_timestamp).toLocaleTimeString()}
        </span>
      </div>

      <p className="text-gray-400">
        Live metrics for all active GPU compute nodes in the cluster.
      </p>

      {/* Responsive Grid for Node Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {clusterState.gpu_nodes.map((node) => (
          <NodeCard key={node.node_name} node={node} />
        ))}
      </div>
    </div>
  );
}