import { useCluster } from '@/context/ClusterContext';
import React from 'react';
import { HiOutlineRefresh } from 'react-icons/hi'; // For loading spinner

// A simple component to render the job status with a colored dot
// Since discover_jobs.py only finds running jobs, we hardcode this to "Running"
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
        <span className="text-red-400">Error loading jobs. Displaying fallback data.</span>
      </div>
    );
  }
  
  // Handle empty state
  if (!jobs || jobs.length === 0) {
     return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <span className="text-gray-400">No active jobs found.</span>
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
                'Session Name',
                'PID',
                'Uptime',
                'Latest Log',
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
                key={job.session} 
                className="hover:bg-gray-800 transition-colors duration-150"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  <JobStatusIndicator />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.node}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-cyan-300">
                  {job.session}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">
                  {job.pid}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.uptime}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">
                  {job.log_preview && job.log_preview.length > 0
                    ? job.log_preview[job.log_preview.length - 1]
                    : 'No logs'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}