import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import useSWR from 'swr';
import ComparisonHistoryGraph from './ComparisonHistoryGraph';

interface ComparisonResult {
    runId: string;
    node: string;
    mode: 'with_jobs' | 'without_jobs';
    duration: number;
    startTime: number;
    endTime: number;
}

interface GpuOption {
    name: string;
    nodeName: string;
    gpuId: number;
    gpuName: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ComparisonTab() {
    const [password, setPassword] = useState('');
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [currentPhase, setCurrentPhase] = useState<'idle' | 'running_with' | 'stopping' | 'running_without' | 'complete'>('idle');
    const [results, setResults] = useState<{
        withJobs?: ComparisonResult;
        withoutJobs?: ComparisonResult;
    }>({});
    const [selectedGpu, setSelectedGpu] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
    const [phaseStartTime, setPhaseStartTime] = useState(0);
    const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);

    // History viewing
    const [showHistory, setShowHistory] = useState(false);
    const [historyRange, setHistoryRange] = useState<'today' | '7d' | 'month' | '1y'>('month');

    // Fetch comparison history
    const { data: historyData } = useSWR(
        showHistory ? `/api/comparison-history?range=${historyRange}` : null,
        fetcher,
        { refreshInterval: 60000 }
    );

    // Fetch GPU options dynamically
    const { data: gpuData, isLoading: isLoadingGpus } = useSWR('/api/gpu-nodes', fetcher, {
        refreshInterval: 30000
    });
    const gpuOptions: GpuOption[] = gpuData?.gpus || [];

    // Set default selected GPU when options are loaded
    useEffect(() => {
        if (gpuOptions.length > 0 && !selectedGpu) {
            setSelectedGpu(gpuOptions[0].name);
        }
    }, [gpuOptions, selectedGpu]);

    // Update estimated time remaining in real-time
    useEffect(() => {
        if (!isRunning || currentPhase === 'idle' || currentPhase === 'complete') {
            return;
        }

        const interval = setInterval(() => {
            const elapsed = (Date.now() - phaseStartTime) / 1000;
            const remaining = Math.max(0, Math.ceil(totalEstimatedTime - elapsed));
            setEstimatedTimeRemaining(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning, currentPhase, phaseStartTime, totalEstimatedTime]);

    const handleStartComparison = () => {
        setShowPasswordModal(true);
        setError(null);
    };

    const handlePasswordSubmit = async () => {
        if (password !== 'NeuroCore') {
            setError('Invalid password');
            return;
        }

        setShowPasswordModal(false);
        setPassword('');
        setIsRunning(true);

        // Phase 1: Run training WITH other jobs
        setCurrentPhase('running_with');
        setResults({});
        setError(null);

        try {
            const selectedGpuData = gpuOptions.find(g => g.name === selectedGpu);
            if (!selectedGpuData) {
                throw new Error('Selected GPU not found');
            }

            console.log('🚀 Running training WITH other jobs...');
            setPhaseStartTime(Date.now());
            setTotalEstimatedTime(25); // Initial estimate for with jobs
            setEstimatedTimeRemaining(25);

            const withJobsResponse = await fetch('/api/run-comparison', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'with_jobs', nodeName: selectedGpuData.nodeName }),
            });

            if (!withJobsResponse.ok) {
                const errorData = await withJobsResponse.json();
                throw new Error(errorData.details || 'Failed to run training with jobs');
            }

            const withJobsData = await withJobsResponse.json();
            console.log('✅ Training with jobs completed:', withJobsData);
            setResults(prev => ({ ...prev, withJobs: withJobsData }));

            // Phase 2: Stop all running jobs
            setCurrentPhase('stopping');
            console.log('🛑 Stopping all jobs...');
            setPhaseStartTime(Date.now());
            setTotalEstimatedTime(5);
            setEstimatedTimeRemaining(5);

            const stopResponse = await fetch('/api/stop-all-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'NeuroCore' }),
            });

            if (!stopResponse.ok) {
                const errorData = await stopResponse.json();
                throw new Error(errorData.details || 'Failed to stop all jobs');
            }

            const stopData = await stopResponse.json();
            console.log('✅ All jobs stopped:', stopData);

            // Wait for system to stabilize
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Phase 3: Run training WITHOUT other jobs
            setCurrentPhase('running_without');
            console.log('🚀 Running training WITHOUT other jobs...');
            setPhaseStartTime(Date.now());
            setTotalEstimatedTime(20); // Initial estimate for without jobs
            setEstimatedTimeRemaining(20);

            const withoutJobsResponse = await fetch('/api/run-comparison', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'without_jobs', nodeName: selectedGpuData.nodeName }),
            });

            if (!withoutJobsResponse.ok) {
                const errorData = await withoutJobsResponse.json();
                throw new Error(errorData.details || 'Failed to run training without jobs');
            }

            const withoutJobsData = await withoutJobsResponse.json();
            console.log('✅ Training without jobs completed:', withoutJobsData);
            setResults(prev => ({ ...prev, withoutJobs: withoutJobsData }));

            setCurrentPhase('complete');
            setEstimatedTimeRemaining(0);

            // Save comparison results to history
            try {
                const selectedGpuData = gpuOptions.find(g => g.name === selectedGpu);
                if (selectedGpuData) {
                    const performanceImpact = ((withJobsData.duration - withoutJobsData.duration) / withJobsData.duration * 100);

                    const comparisonHistoryData = {
                        timestamp: new Date().toISOString(),
                        runId: `comp_${Date.now()}`,
                        node: selectedGpuData.nodeName,
                        gpuId: selectedGpuData.gpuId,
                        gpuName: selectedGpuData.gpuName,
                        results: {
                            with_jobs: {
                                duration: withJobsData.duration
                            },
                            without_jobs: {
                                duration: withoutJobsData.duration
                            }
                        },
                        performanceImpact
                    };

                    await fetch('/api/comparison-history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(comparisonHistoryData)
                    });

                    console.log('✅ Comparison results saved to history');
                }
            } catch (saveError) {
                console.error('Failed to save comparison history:', saveError);
                // Don't fail the whole comparison if history save fails
            }

        } catch (err: any) {
            console.error('❌ Comparison failed:', err);
            setError(err.message || 'Comparison failed');
            setCurrentPhase('idle');
            setEstimatedTimeRemaining(0);
        } finally {
            setIsRunning(false);
        }
    };

    const chartData = results.withJobs && results.withoutJobs ? [
        {
            name: 'With Jobs',
            duration: results.withJobs.duration,
        },
        {
            name: 'Without Jobs',
            duration: results.withoutJobs.duration,
        }
    ] : [];

    const improvement = results.withJobs && results.withoutJobs
        ? ((results.withJobs.duration - results.withoutJobs.duration) / results.withJobs.duration * 100).toFixed(2)
        : null;

    const getPhaseLabel = () => {
        switch (currentPhase) {
            case 'running_with': return 'Running training with concurrent jobs';
            case 'stopping': return 'Stopping all running jobs';
            case 'running_without': return 'Running training without concurrent jobs';
            case 'complete': return 'Comparison complete';
            default: return '';
        }
    };

    const getPhaseNumber = () => {
        switch (currentPhase) {
            case 'running_with': return '1/3';
            case 'stopping': return '2/3';
            case 'running_without': return '3/3';
            case 'complete': return 'Done';
            default: return '';
        }
    };

    // Calculate total estimated time dynamically
    const calculateTotalEstimate = () => {
        // Base estimates: with_jobs=25s, stop=5s, without_jobs=20s
        return '~50 seconds';
    };

    return (
        <div className="space-y-6">
            {/* Historical Comparison Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-1">Comparison History</h3>
                        <p className="text-sm text-gray-400">Track GPU performance impact over time</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {showHistory && (
                            <div className="flex bg-gray-800 rounded-md p-1 border border-gray-700">
                                {(['today', '7d', 'month', '1y'] as const).map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setHistoryRange(r)}
                                        className={`px-3 py-1 rounded text-xs font-semibold transition-all ${historyRange === r
                                            ? 'bg-cyan-600 text-white shadow'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        {r.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${showHistory
                                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                : 'bg-cyan-600 text-white hover:bg-cyan-500'
                                }`}
                        >
                            {showHistory ? 'Hide History' : 'View History'}
                        </button>
                    </div>
                </div>

                {showHistory && (
                    <ComparisonHistoryGraph
                        data={historyData?.data || []}
                        range={historyRange}
                    />
                )}
            </div>

            {/* Header Section */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <div className="flex items-start justify-between gap-6 mb-6">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-2">Performance Comparison</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Compare training performance with and without concurrent jobs. First runs training with current workload,
                            then stops all jobs and runs again for comparison.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Target GPU</label>
                        {isLoadingGpus ? (
                            <div className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-400 text-sm">
                                Loading GPUs...
                            </div>
                        ) : gpuOptions.length === 0 ? (
                            <div className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-400 text-sm">
                                No GPUs available
                            </div>
                        ) : (
                            <select
                                value={selectedGpu}
                                onChange={(e) => setSelectedGpu(e.target.value)}
                                disabled={isRunning}
                                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-600 transition-colors"
                            >
                                {gpuOptions.map((gpu) => (
                                    <option key={gpu.name} value={gpu.name}>
                                        {gpu.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Estimated Duration</label>
                        <div className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-300 text-sm">
                            {calculateTotalEstimate()}
                        </div>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={handleStartComparison}
                            disabled={isRunning || gpuOptions.length === 0}
                            className={`w-full px-5 py-2 rounded-md text-sm font-semibold transition-colors ${isRunning || gpuOptions.length === 0
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                                }`}
                        >
                            {isRunning ? 'Running...' : 'Start Comparison'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-white mb-3">Authentication Required</h3>
                        <p className="text-gray-400 text-sm mb-4">
                            This will stop all running jobs on the cluster during the comparison. Enter password to continue.
                        </p>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            placeholder="Enter password"
                            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-cyan-600"
                            autoFocus
                        />
                        {error && (
                            <p className="text-red-400 text-sm mb-4">{error}</p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowPasswordModal(false);
                                    setPassword('');
                                    setError(null);
                                }}
                                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePasswordSubmit}
                                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-sm font-medium transition-colors"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Indicator */}
            {isRunning && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                            <p className="text-sm text-gray-300">{getPhaseLabel()}</p>
                        </div>
                        <div className="text-xs text-gray-500">{getPhaseNumber()}</div>
                    </div>
                    {estimatedTimeRemaining > 0 && (
                        <div className="text-xs text-gray-500">
                            Estimated time remaining: ~{Math.ceil(estimatedTimeRemaining)} seconds
                        </div>
                    )}
                </div>
            )}

            {/* Results Section */}
            {chartData.length > 0 && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">With Running Jobs</div>
                            <div className="text-2xl font-semibold text-white">{results.withJobs?.duration.toFixed(2)}s</div>
                            <div className="text-xs text-gray-500 mt-1">Current cluster load</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Without Running Jobs</div>
                            <div className="text-2xl font-semibold text-white">{results.withoutJobs?.duration.toFixed(2)}s</div>
                            <div className="text-xs text-gray-500 mt-1">Clean environment</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Performance Impact</div>
                            <div className={`text-2xl font-semibold ${parseFloat(improvement || '0') > 0 ? 'text-cyan-400' : 'text-gray-400'}`}>
                                {parseFloat(improvement || '0') > 0 ? '+' : ''}{improvement}%
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                {parseFloat(improvement || '0') > 0 ? 'Slower with jobs' : 'No difference'}
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                        <h3 className="text-sm font-semibold text-white mb-6">Training Duration Comparison</h3>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#9ca3af"
                                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                                        tickLine={false}
                                        axisLine={{ stroke: '#374151' }}
                                    />
                                    <YAxis
                                        stroke="#9ca3af"
                                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                                        tickLine={false}
                                        axisLine={{ stroke: '#374151' }}
                                        label={{ value: 'Duration (seconds)', angle: -90, position: 'insideLeft', fill: '#9ca3af', style: { fontSize: 11 } }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1f2937',
                                            border: '1px solid #374151',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            color: '#f3f4f6'
                                        }}
                                        formatter={(value: number) => [`${value.toFixed(2)}s`, 'Duration']}
                                    />
                                    <Bar dataKey="duration" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Analysis */}
                    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white mb-1">Analysis</h4>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    {parseFloat(improvement || '0') > 0
                                        ? `Training took ${improvement}% longer when running with concurrent jobs. This indicates that resource contention (CPU, GPU, memory, or I/O) impacts training efficiency on ${selectedGpu}.`
                                        : 'No significant performance difference detected between scenarios. The cluster may have good resource isolation or the workload was minimal during testing.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && !isRunning && (
                <div className="bg-gray-900 border border-red-900/50 rounded-lg p-5">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
                            <p className="text-sm text-gray-400">{error}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
