import JobTable from '@/components/jobs/JobTable';

export default function JobsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-white">Active Jobs</h1>
      
      <p className="text-gray-400">
        This table shows all running and pending jobs (simulated from tmux sessions).
      </p>

      <JobTable />
    </div>
  );
}