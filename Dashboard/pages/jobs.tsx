import JobTable from '@/components/jobs/JobTable'; // 1. ℹ️ We are reusing our existing table
import { useCluster } from '@/context/ClusterContext'; // 2. 🧠 We import this to get the job count

export default function JobsPage() {
  const { jobs } = useCluster(); // 3. 🎁 Get the list of jobs

  return (
    <div className="space-y-8"> {/* ℹ️ Added space between sections */}

      {/* --- 1. Queue Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Queue</h2>
        
        {/* 4. 📊 This is the new stats box from the mockup */}
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mb-6">
          <p className="text-gray-400">
            [Stats about the queue and active jobs: Number of jobs in queue/that are active, estimated runtime, preview of an (extendable) list that shows information about jobs]
          </p>
          {/* We can add a simple live stat here: */}
          <p className="text-lg text-white mt-2">
            Total Active Jobs: <span className="font-bold text-cyan-300">{jobs.length}</span>
          </p>
        </div>

        {/* 5. ✅ We reuse our existing JobTable component as the "preview list" */}
        <JobTable /> 
      </div>

      {/* --- 2. Per-User Stats Section --- */}
      <div>
        <h2 className="text-2xl font-semibold text-white mb-4">Per-User Stats</h2>
        
        {/* 6. ℹ️ This is a placeholder for our next task */}
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