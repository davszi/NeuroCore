import React, { useState, useMemo } from 'react';
import { useCluster } from '@/context/ClusterContext';
import { HiOutlineRefresh } from 'react-icons/hi';
// FIXED: Removed unused 'Job' import

const JobStatusIndicator: React.FC<{ isCpu?: boolean }> = ({ isCpu }) => (
  <div className="flex items-center">
    <span
      className={`h-2.5 w-2.5 rounded-full mr-2 ${isCpu ? 'bg-blue-500' : 'bg-green-500'}`}
    ></span>
    <span>{isCpu ? 'CPU' : 'GPU'}</span>
  </div>
);

export default function JobTable() {
  const { jobs, isJobsLoading, jobsError } = useCluster();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    const term = searchTerm.toLowerCase();
    return jobs.filter(
      (job) =>
        (job.user || '').toLowerCase().includes(term) ||
        (job.node || '').toLowerCase().includes(term) ||
        (job.process_name || '').toLowerCase().includes(term)
    );
  }, [jobs, searchTerm]);

  if (isJobsLoading && !jobsError) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <HiOutlineRefresh className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-300">Loading active jobs...</span>
      </div>
    );
  }

  if (jobsError) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <span className="text-red-400">Error loading jobs.</span>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-lg">
        <span className="text-gray-400">No active jobs found.</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      <div className="p-4">
        <input
          type="text"
          placeholder="Search by user, node, or command..."
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto min-h-[200px] max-h-[500px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              {['Status', 'Node', 'User', 'PID', 'GPU Memory / CPU %', 'Command Preview'].map(
                (header) => (
                  <th
                    key={header}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-400">
                  No jobs match your search.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const isCpu = job.cpu_percent !== undefined;
                return (
                  <tr
                    key={`${job.node}-${job.pid}-${job.process_name}`}
                    className="hover:bg-gray-800 transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">
                      <JobStatusIndicator isCpu={isCpu} />
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
                      {isCpu
                        ? `${(job.cpu_percent || 0).toFixed(1)} %`
                        : `${job.gpu_memory_usage_mib.toFixed(0)} MiB`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400 truncate max-w-sm">
                      {job.process_name}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}