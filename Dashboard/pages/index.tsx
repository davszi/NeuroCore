import { useCluster } from '@/context/ClusterContext';
import NodeCard from '@/components/monitoring/NodeCard';
import LoginNodeCard from '@/components/dashboard/LoginNodeCard'; // 1. ✅ Import our new component
import { useClientMounted } from '@/hooks/useClientMounted';

export default function DashboardPage() {
  // 2. ✅ Get the full clusterState (which includes 'login_nodes')
  const { clusterState } = useCluster();
  const isClient = useClientMounted();

  return (
    <div className="space-y-8"> {/* ℹ️ Added a bit more vertical space */}

      {/* --- Header --- */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="text-sm text-gray-400">
            Total Power: {clusterState.total_power_consumption_watts}W
          </span>
          <span className="text-sm text-gray-400">
            Last updated: 
            {isClient ? new Date(clusterState.last_updated_timestamp).toLocaleTimeString() : '...'}
          </span>
        </div>
      </div>
    
      {/* 3. ✅ --- NEW: Login Nodes Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">
          Login Nodes
        </h2>
        {/* We create a responsive grid. It will show 1, 2, or 3 cards per row. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* We map over the 'login_nodes' array from the API */}
          {clusterState.login_nodes.map((node) => (
            <LoginNodeCard key={node.node_name} node={node} />
          ))}
        </div>
      </div>
      {/* --- END OF NEW SECTION --- */}


      {/* --- GPU Node Overview Section (Unchanged) --- */}
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