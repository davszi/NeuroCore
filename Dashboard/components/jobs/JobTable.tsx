import { useCluster } from '@/context/ClusterContext';
import React from 'react';

// A simple component to render the job status with a colored dot
const JobStatusIndicator: React.FC<{ status: 'Running' | 'Pending' | 'Completed' }> = ({ status }) => {
  const color = {
    Running: 'bg-green-500',
    Pending: 'bg-yellow-500',
    Completed: 'bg-gray-500',
  }[status];

  return (
    <div className="flex items-center">
      <span className={`h-2.5 w-2.5 rounded-full ${color} mr-2`}></span>
      <span>{status}</span>
    </div>
  );
};

export default function JobTable() {
  const { jobs } = useCluster();

  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden">
      {/* Container for responsive horizontal scrolling on small screens */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          {/* Table Header */}
          <thead className="bg-gray-800">
            <tr>
              {[
                'Status',
                'Owner',
                'Session Name',
                'Mode',
                'Node',
                'Uptime',
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
              <tr key={job.job_id} className="hover:bg-gray-800 transition-colors duration-150">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  <JobStatusIndicator status={job.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.owner}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-cyan-300">
                  {job.session_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.mode}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.node}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                  {job.uptime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}