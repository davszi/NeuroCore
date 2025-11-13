import { useMemo } from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';

import JobTable from '@/components/jobs/JobTable';
import { useCluster } from '@/context/ClusterContext';

type NodeStat = {
  node: string;
  jobCount: number;
};

type UserStat = {
  user: string;
  jobCount: number;
  totalSeconds: number;
};

function extractOwnerFromSession(session: string): string {
  if (!session) return 'unknown';
  const parts = session.split(':');
  if (parts.length >= 2) {
    const owner = parts[1] || parts[0];
    return owner || 'unknown';
  }
  return parts[0] || 'unknown';
}

function parseUptimeToSeconds(uptime: string | undefined | null): number {
  if (!uptime) return 0;
  const trimmed = uptime.trim();
  if (!trimmed) return 0;

  let timePart = trimmed;
  let days = 0;

  if (trimmed.includes('-')) {
    const [dayPart, rest] = trimmed.split('-', 2);
    if (dayPart && /^\d+$/.test(dayPart)) {
      days = parseInt(dayPart, 10);
      timePart = rest || '';
    }
  }

  const segments = timePart
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const values = segments.map((segment) => {
    const parsed = Number(segment);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (values.length === 3) {
    [hours, minutes, seconds] = values;
  } else if (values.length === 2) {
    [minutes, seconds] = values;
  } else if (values.length === 1) {
    seconds = values[0];
  }

  const totalHours = days * 24 + hours;
  return totalHours * 3600 + minutes * 60 + seconds;
}

function formatDuration(valueInSeconds: number): string {
  if (!Number.isFinite(valueInSeconds) || valueInSeconds <= 0) {
    return '0m';
  }

  let remaining = valueInSeconds;
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;

  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;

  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  if (!parts.length) {
    parts.push(`${seconds}s`);
  }

  return parts.slice(0, 2).join(' ');
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <p className="text-sm uppercase tracking-wide text-gray-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

function SummaryList({
  title,
  rows,
  emptyPlaceholder,
}: {
  title: string;
  rows: { label: string; value: string }[];
  emptyPlaceholder: string;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{emptyPlaceholder}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-md bg-gray-800/60 px-3 py-2 text-sm text-gray-200"
            >
              <span className="font-medium text-cyan-300">{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UserStatsTable({ stats }: { stats: UserStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-gray-700 bg-gray-900">
        <span className="text-sm text-gray-500">No active jobs found for any user.</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-800">
          <thead className="bg-gray-800">
            <tr>
              {['User', 'Active Jobs', 'Combined Uptime'].map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-900">
            {stats.map((stat) => (
              <tr key={stat.user} className="transition-colors duration-150 hover:bg-gray-800/70">
                <td className="px-6 py-4 text-sm font-medium text-cyan-300">{stat.user}</td>
                <td className="px-6 py-4 text-sm text-gray-200">{stat.jobCount}</td>
                <td className="px-6 py-4 text-sm text-gray-200">{formatDuration(stat.totalSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const { jobs, isJobsLoading, jobsError } = useCluster();

  const jobList = jobs ?? [];

  const { activeNodes, nodeStats, userStats, totalUptimeSeconds } = useMemo(() => {
    const nodeMap = new Map<string, number>();
    const userMap = new Map<string, { jobCount: number; totalSeconds: number }>();

    let uptimeAccumulator = 0;

    jobList.forEach((job) => {
      const seconds = parseUptimeToSeconds(job.uptime);
      uptimeAccumulator += seconds;

      nodeMap.set(job.node, (nodeMap.get(job.node) ?? 0) + 1);

      const owner = extractOwnerFromSession(job.session);
      const userEntry = userMap.get(owner) ?? { jobCount: 0, totalSeconds: 0 };
      userEntry.jobCount += 1;
      userEntry.totalSeconds += seconds;
      userMap.set(owner, userEntry);
    });

    const nodeStatsArray: NodeStat[] = Array.from(nodeMap.entries()).map(([node, jobCount]) => ({
      node,
      jobCount,
    }));
    nodeStatsArray.sort((a, b) => b.jobCount - a.jobCount || a.node.localeCompare(b.node));

    const userStatsArray: UserStat[] = Array.from(userMap.entries()).map(
      ([user, { jobCount, totalSeconds }]) => ({
        user,
        jobCount,
        totalSeconds,
      }),
    );
    userStatsArray.sort((a, b) => b.jobCount - a.jobCount || a.user.localeCompare(b.user));

    return {
      activeNodes: nodeStatsArray.length,
      nodeStats: nodeStatsArray,
      userStats: userStatsArray,
      totalUptimeSeconds: uptimeAccumulator,
    };
  }, [jobList]);

  const avgUptimeSeconds =
    jobList.length > 0 ? Math.round(totalUptimeSeconds / jobList.length) : 0;

  const summaryRows = nodeStats.slice(0, 6).map((entry) => ({
    label: entry.node,
    value: `${entry.jobCount} job${entry.jobCount === 1 ? '' : 's'}`,
  }));

  const queueHeaderContent = (() => {
    if (isJobsLoading) {
      return (
        <div className="flex items-center text-sm text-gray-400">
          <HiOutlineRefresh className="mr-2 h-4 w-4 animate-spin" />
          Fetching latest job data…
        </div>
      );
    }
    if (jobsError) {
      return <p className="text-sm text-yellow-400">Using fallback job data (API error).</p>;
    }
    return (
      <p className="text-sm text-gray-400">
        Updated every 5 seconds. Showing active jobs discovered via SSH polling.
      </p>
    );
  })();

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Queue</h2>
          {queueHeaderContent}
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Active Jobs" value={jobList.length.toString()} />
          <StatCard title="Active Nodes" value={activeNodes.toString()} />
          <StatCard
            title="Average Uptime"
            value={jobList.length ? formatDuration(avgUptimeSeconds) : '—'}
            subtitle={jobList.length ? 'Across all active jobs' : undefined}
          />
          <StatCard
            title="Total Combined Uptime"
            value={jobList.length ? formatDuration(totalUptimeSeconds) : '—'}
          />
        </div>

        <SummaryList
          title="Jobs per Node"
          rows={summaryRows}
          emptyPlaceholder="No nodes currently running jobs."
        />

        <div className="mt-6">
          <JobTable />
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Per-User Stats</h2>
          <p className="text-sm text-gray-400">
            Aggregated from active sessions (train:owner:project:mode).
          </p>
        </div>

        <UserStatsTable stats={userStats} />
      </section>
    </div>
  );
}