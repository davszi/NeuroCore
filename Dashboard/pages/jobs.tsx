import React from 'react';
import Head from 'next/head';
import JobTable from '@/components/jobs/JobTable';
import { useCluster } from '@/context/ClusterContext';

export default function JobsPage() {
  const { jobs, isLoading } = useCluster();

  // Simple stats calculation
  const totalJobs = jobs ? jobs.length : 0;
  const cpuJobs = jobs ? jobs.filter(j => j.gpu_memory_usage_mib === 0).length : 0;
  const gpuJobs = totalJobs - cpuJobs;

  return (
    <>
      <Head>
        <title>Active Jobs | Cluster Dashboard</title>
      </Head>

      <div className="space-y-8 p-6">
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">Active Queue</h2>
          
          {/* Quick Stats Banner */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-700 mb-6 flex flex-wrap gap-8 items-center">
             <div>
                <p className="text-gray-400 text-sm">Total Active Jobs</p>
                <p className="text-3xl font-bold text-white">{isLoading ? '...' : totalJobs}</p>
             </div>
             <div>
                <p className="text-gray-400 text-sm">GPU Jobs</p>
                <p className="text-3xl font-bold text-green-400">{isLoading ? '...' : gpuJobs}</p>
             </div>
             <div>
                <p className="text-gray-400 text-sm">CPU Jobs</p>
                <p className="text-3xl font-bold text-blue-400">{isLoading ? '...' : cpuJobs}</p>
             </div>
          </div>

          <JobTable /> 
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">Per-User Stats</h2>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm mb-2">
              Historical usage statistics are coming soon.
            </p>
            <p className="text-yellow-400 font-mono text-sm">
              (Feature Under Construction)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}