import React from 'react';
import { HiCheckCircle, HiXCircle, HiClock, HiRefresh, HiServer, HiTerminal } from 'react-icons/hi';
import useSWR from 'swr';
import MonthlyComparisonChart, { MonthlyBenchmarkData } from './MonthlyComparisonChart';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export interface BenchmarkResult {
  gpuId: string;
  nodeName: string;
  gpuName: string;
  status: 'completed' | 'failed' | 'running';
  startTime: string;
  endTime?: string;
  duration?: number; // in seconds
  metrics: {
    utilization_avg: number;
    memory_used_avg: number;
    temperature_avg: number;
    power_consumption_avg: number;
    benchmark_score?: number;
  };
  error?: string;
}

interface Props {
  results: BenchmarkResult[];
  monthlyData?: MonthlyBenchmarkData[];
  isRunning: boolean;
  currentGpu?: string;
  status?: string;
  logs?: { timestamp: number; message: string }[];
  onRetry?: () => void;
  benchmarkId?: string | null;
}

export default function BenchmarkResultsView({ results, monthlyData = [], isRunning, currentGpu, status, logs = [], onRetry, benchmarkId }: Props) {
  const [selectedMetric, setSelectedMetric] = React.useState<'utilization' | 'memory' | 'temperature' | 'power' | 'score'>('utilization');
  const [isCancelling, setIsCancelling] = React.useState(false);
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  const { data: clusterData } = useSWR<{ nodes: { name: string, hasGpu: boolean }[] }>('/api/cluster-nodes', fetcher);
  const nodes = React.useMemo(() => clusterData?.nodes.map(n => n.name) || ["cloud-202", "cloud-203", "cloud-204", "cloud-205", "cloud-243", "cloud-247"], [clusterData]);

  React.useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (status === 'initializing' || status === 'stopping_jobs' || status === 'ready' || status === 'cancelled') {
    // Parse logs to determine node status
    const nodeStatus = nodes.reduce((acc, node) => {
      const nodeLogs = logs.filter(l => l.message.includes(node));
      let state = 'waiting'; // waiting, processing, error, done
      let detail = 'Waiting initialization...';

      if (nodeLogs.length > 0) {
        state = 'processing';
        detail = 'Initializing...';

        // Detect intermediate states first
        if (nodeLogs.some(l => l.message.includes('Canceling SLURM'))) detail = 'Stopping Jobs...';
        if (nodeLogs.some(l => l.message.includes('Stopping user processes'))) detail = 'Stopping Jobs...';

        // Detect Errors
        if (nodeLogs.some(l => l.message.includes('Error') || l.message.includes('failed') || l.message.includes('WARNING') || l.message.includes('SKIPPING'))) {
          state = 'error';
          detail = 'Attention Needed';
          if (nodeLogs.some(l => l.message.includes('authentication'))) detail = 'Auth Failed';
          if (nodeLogs.some(l => l.message.includes('SKIPPING'))) detail = 'Skipped';
        }

        // Detect Success - MUST be last to override warnings if the system proceeded anyway
        // Check for "VERIFIED" explicitly, as start.ts logs this on success even if warnings occurred
        if (nodeLogs.some(l => l.message.includes('VERIFIED') || l.message.includes('Proceeding'))) {
          state = 'done';
          detail = 'Ready';
        }
      }
      acc[node] = { state, detail };
      return acc;
    }, {} as Record<string, { state: string, detail: string }>);

    const readyCount = nodes.filter(n => nodeStatus[n] && nodeStatus[n].state === 'done').length;
    const errorCount = nodes.filter(n => nodeStatus[n] && nodeStatus[n].state === 'error').length;
    const isGlobalError = errorCount > 0 && readyCount === 0; // Only major error if NO nodes are ready

    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto">

        {/* Main Status Container */}
        <div className="relative overflow-hidden rounded-xl border border-gray-800 bg-[#0f1117] shadow-xl">

          <div className="p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-5">
                <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gray-900 border border-gray-800 shadow-inner group">
                  {isGlobalError ? (
                    <HiXCircle className="w-6 h-6 text-red-500" />
                  ) : (
                    <>
                      <div className="absolute w-full h-full rounded-xl bg-cyan-500/10 animate-ping opacity-20" />
                      <HiServer className="w-6 h-6 text-cyan-400 relative z-10" />
                    </>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight font-display mb-1">
                    {isGlobalError ? 'Initialization Issue Detected' : status === 'cancelled' ? 'Benchmark Stopped' : 'Initializing Benchmark'}
                  </h2>
                  <p className="text-gray-400 text-sm font-medium flex items-center gap-2">
                    {isGlobalError
                      ? <span className="text-red-400">One or more nodes failed preparation.</span>
                      : status === 'cancelled'
                        ? <span className="text-orange-400 font-bold">Process terminated by user request.</span>
                        : status === 'ready'
                          ? <span className="text-green-400 font-bold">All nodes prepared. Starting benchmark...</span>
                          : <span className="text-cyan-400">Stopping active jobs and verifying cluster state...</span>
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="px-4 py-2 rounded-lg bg-gray-900/50 border border-gray-800 backdrop-blur-md">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mr-2">Status</span>
                  <span className={`text-sm font-bold ${readyCount === nodes.length ? 'text-green-400' : 'text-white'}`}>
                    {readyCount} / {nodes.length} Nodes Ready
                  </span>
                </div>
                {(isGlobalError || status === 'cancelled') && onRetry && (
                  <button
                    onClick={onRetry}
                    className={`px-4 py-2 rounded-lg ${status === 'cancelled' ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-red-600 hover:bg-red-500'} text-white text-sm font-bold shadow-lg transition-all flex items-center gap-2`}
                  >
                    <HiRefresh className="w-4 h-4" />
                    {status === 'cancelled' ? 'Start Over' : 'Retry'}
                  </button>
                )}
                {!isGlobalError && status !== 'ready' && status !== 'cancelled' && benchmarkId && (
                  <button
                    onClick={async () => {
                      if (confirm('Are you sure you want to stop the benchmark process?')) {
                        setIsCancelling(true);
                        try {
                          await fetch('/api/performance-benchmark/cancel', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ benchmarkId }),
                          });
                        } catch (e) {
                          console.error('Failed to cancel:', e);
                        } finally {
                          setIsCancelling(false);
                        }
                      }
                    }}
                    disabled={isCancelling}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-red-400 text-sm font-bold border border-gray-700 hover:border-red-500/50 shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <HiXCircle className={`w-4 h-4 ${isCancelling ? 'animate-spin' : ''}`} />
                    {isCancelling ? 'Stopping...' : 'Stop Benchmark'}
                  </button>
                )}
              </div>
            </div>

            {/* Node Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {nodes.map(node => {
                const { state, detail } = nodeStatus[node];
                const isError = state === 'error';
                const isDone = state === 'done';
                const isProcessing = state === 'processing';

                return (
                  <div key={node} className={`group relative p-4 rounded-lg border transition-all duration-300 ${isError ? 'bg-red-950/5 border-red-500/20' :
                    isDone ? 'bg-green-950/5 border-green-500/20' :
                      isProcessing ? 'bg-cyan-950/5 border-cyan-500/20' :
                        'bg-gray-950/30 border-gray-800'
                    }`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <HiServer className={`w-4 h-4 ${isError ? 'text-red-500' : isDone ? 'text-green-500' : 'text-gray-500'}`} />
                        <span className="font-bold text-sm text-gray-200 tracking-wide">{node}</span>
                      </div>
                      {isProcessing && <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />}
                      {isDone && <HiCheckCircle className="w-5 h-5 text-green-500 shadow-green-500/50 drop-shadow-sm" />}
                      {isError && <HiXCircle className="w-5 h-5 text-red-500 shadow-red-500/50 drop-shadow-sm" />}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className={`text-xs font-semibold uppercase tracking-wider ${isError ? 'text-red-400' :
                          isDone ? 'text-green-400' :
                            isProcessing ? 'text-cyan-400 animate-pulse' :
                              'text-gray-500'
                          }`}>
                          {detail}
                        </p>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isDone ? 'w-full bg-green-500' :
                          isError ? 'w-full bg-red-500' :
                            isProcessing ? 'w-2/3 bg-cyan-500 animate-progress origin-left' :
                              'w-0 bg-gray-700'
                          }`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logs Section */}
            <div className="bg-black/40 rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                  <HiTerminal className="w-4 h-4" />
                  <span>System Output</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
                </div>
              </div>
              <div className="p-4 h-[250px] overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 text-gray-300 hover:bg-white/5 py-0.5 px-2 rounded -mx-2 transition-colors">
                    <span className="text-gray-600 shrink-0 select-none w-16 opacity-70">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`break-all ${log.message.includes('✅') ? 'text-green-400 font-medium' :
                      log.message.includes('🔴') ? 'text-red-400 font-bold bg-red-900/10 px-1 rounded inline-block' :
                        log.message.includes('⚠️') ? 'text-yellow-400' :
                          log.message.includes('MISSING') ? 'text-orange-500 font-bold underline' :
                            log.message.includes('Wait') ? 'text-gray-500 italic' :
                              log.message.includes('Start') ? 'text-cyan-400 font-bold' :
                                'text-gray-300'
                      }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const completedCount = results.filter(r => r.status === 'completed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const runningCount = results.filter(r => r.status === 'running').length;

  return (
    <div className="space-y-6">
      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase">Total GPUs</p>
              <p className="text-2xl font-bold text-white mt-1">{results.length}</p>
            </div>
            <div className="p-2 bg-gray-800 rounded-lg">
              <HiCheckCircle className="w-6 h-6 text-gray-400" />
            </div>
          </div>
        </div>
        <div className="bg-gray-900 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase">Completed</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{completedCount}</p>
            </div>
            <div className="p-2 bg-green-500/10 rounded-lg">
              <HiCheckCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>
        <div className="bg-gray-900 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase">Failed</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{failedCount}</p>
            </div>
            <div className="p-2 bg-red-500/10 rounded-lg">
              <HiXCircle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>
        <div className="bg-gray-900 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase">Running</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">{runningCount}</p>
            </div>
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <HiClock className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Current Progress */}
      {isRunning && currentGpu && (
        <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4 flex items-center justify-between gap-4 animate-pulse-slow">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-cyan-500/10 rounded-full">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-cyan-300 font-semibold">Benchmark in progress...</p>
              <p className="text-cyan-400/80 text-sm">Currently testing: {currentGpu}</p>
            </div>
          </div>

          {benchmarkId && (
            <button
              onClick={async () => {
                if (confirm('Are you sure you want to stop the benchmark?')) {
                  setIsCancelling(true);
                  try {
                    await fetch('/api/performance-benchmark/cancel', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ benchmarkId }),
                    });
                  } catch (e) {
                    console.error('Failed to cancel:', e);
                  } finally {
                    setIsCancelling(false);
                  }
                }
              }}
              disabled={isCancelling}
              className="px-4 py-2 rounded-lg bg-gray-900/50 hover:bg-red-900/30 text-red-400 text-sm font-bold border border-gray-800 hover:border-red-500/50 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <HiXCircle className={`w-4 h-4 ${isCancelling ? 'animate-spin' : ''}`} />
              {isCancelling ? 'Stopping...' : 'Stop Benchmark'}
            </button>
          )}
        </div>
      )}

      {/* Results Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  GPU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Utilization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Memory
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Temperature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Power
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-800">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No benchmark results yet. Start a benchmark to see results here.
                  </td>
                </tr>
              ) : (
                results.map((result, idx) => (
                  <tr
                    key={result.gpuId}
                    className={`hover:bg-gray-800 transition-colors ${result.status === 'running' ? 'bg-yellow-900/10' : ''
                      }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-white">{result.gpuId}</p>
                        <p className="text-xs text-gray-400">{result.gpuName}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {result.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-green-500/20 text-green-400">
                          <HiCheckCircle className="w-3 h-3" />
                          Completed
                        </span>
                      )}
                      {result.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400">
                          <HiXCircle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                      {result.status === 'running' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400">
                          <HiClock className="w-3 h-3 animate-spin" />
                          Running
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {result.status === 'completed' ? `${result.metrics.utilization_avg.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {result.status === 'completed' ? `${(result.metrics.memory_used_avg / 1024).toFixed(1)} GB` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {result.status === 'completed' ? `${result.metrics.temperature_avg.toFixed(1)}°C` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {result.status === 'completed' ? `${result.metrics.power_consumption_avg.toFixed(1)} W` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {result.duration ? `${Math.floor(result.duration / 60)}m ${result.duration % 60}s` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Comparison Chart */}
      {monthlyData.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Performance History Timeline</h3>
            <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
              {(['utilization', 'memory', 'temperature', 'power', 'score'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${selectedMetric === m
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                    }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <MonthlyComparisonChart data={monthlyData} metric={selectedMetric} />
        </div>
      )}
    </div>
  );
}
