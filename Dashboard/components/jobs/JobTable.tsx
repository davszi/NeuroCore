import { useCluster } from '@/context/ClusterContext';
import React from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';

// A simple component to render the job status with a colored dot
const JobStatusIndicator: React.FC = () => {
  return (
    <div className="flex items-center">
      <span className="h-2.5 w-2.5 rounded-full bg-green-500 mr-2"></span>
      <span>Running</span>
    </div>
  );
};

export default function JobTable() {
  const { jobs, isJobsLoading, jobsError } = useCluster();

  // Handle loading state
  if (isJobsLoading && !jobsError) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <HiOutlineRefresh className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-300">Loading active jobs...</span>
      </div>
    );
  }

  // Handle error state
  if (jobsError) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <span className="text-red-400">Error loading jobs.</span>
      </div>
    );
  }
  
  // Handle empty state
  if (!jobs || jobs.length === 0) {
     return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <span className="text-gray-400">No active GPU jobs found.</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      {/* Container for responsive horizontal scrolling on small screens */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          
          {/* Table Header */}
          <thead className="bg-gray-800">
            <tr>
              {[
                'Status',
                'Node',
                'User',
                'PID',
                'GPU Memory',
                'Command Preview',
              ].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {jobs.map((job) => (
              <tr 
                key={job.pid}
                className="hover:bg-gray-800 transition-colors duration-150"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  <JobStatusIndicator />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.node}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-cyan-300">
                  {job.user}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">
                  {job.pid}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">
                  {job.gpu_memory_usage_mib.toFixed(0)} MiB
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400 truncate max-w-sm">
                  {job.process_name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}