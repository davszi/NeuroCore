import React from 'react';
import { HiCheckCircle, HiXCircle, HiClock } from 'react-icons/hi';
import MonthlyComparisonChart, { MonthlyBenchmarkData } from './MonthlyComparisonChart';

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
}

export default function BenchmarkResultsView({ results, monthlyData = [], isRunning, currentGpu }: Props) {
  const [selectedMetric, setSelectedMetric] = React.useState<'utilization' | 'memory' | 'temperature' | 'power' | 'score'>('utilization');

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
        <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4 flex items-center gap-4">
          <div className="p-2 bg-cyan-500/10 rounded-full">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-cyan-300 font-semibold">Benchmark in progress...</p>
            <p className="text-cyan-400/80 text-sm">Currently testing: {currentGpu}</p>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
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

