import JobTable from '@/components/jobs/JobTable'; 
import { useCluster } from '@/context/ClusterContext';

export default function JobsPage() {
  const { jobs } = useCluster(); 

  return (
    <div className="space-y-8">

      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Queue</h2>
        
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mb-6">
          <p className="text-gray-400">
            [Stats about the queue and active jobs: Number of jobs in queue/that are active, estimated runtime, preview of an (extendable) list that shows information about jobs]
          </p>
          <p className="text-lg text-white mt-2">
            Total Active Jobs: <span className="font-bold text-cyan-300">{jobs.length}</span>
          </p>
        </div>

        <JobTable /> 
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Per-User Stats</h2>
        
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400">
            [Who has been using how much GPUs? Multiple time-horizons (today, last week, last month, total)]
          </p>
          <p className="text-yellow-400 mt-2">
            (Component not yet built)
          </p>
        </div>
      </div>
    </div>
  );
}