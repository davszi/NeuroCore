import React, { useState, useEffect } from 'react';
import { 
  HiLightningBolt, HiClock, HiChartBar, HiChip, HiServer, 
  HiPlus, HiX, HiAdjustments, HiCheckCircle, HiPlay, HiTrash, 
  HiDownload
} from 'react-icons/hi'; 
import TrainingLossChart from './TrainingLossChart';
import TrainingPerplexityChart from './TrainingPerplexityChart';
import NewRunModal from './NewRunModal';
import LearningRateChart from './LearningRateChart';
import ResourceChart from './ResourceChart';

interface Props {
  activeTab: string;
}

interface ComparisonRun {
  id: string;
  node: string;
  display: string;
  color: string;
}

// Distinct colors for comparison lines
const CHART_COLORS = [
  "#22D3EE", // Cyan
  "#F472B6", // Pink
  "#A78BFA", // Purple
  "#34D399", // Emerald
  "#FBBF24", // Amber
];

export default function MLBenchmarkTab({ activeTab }: Props) {
  
  // --- STATE ---
  // 1. Background Active Run (The process actually running)
  const [activeRun, setActiveRun] = useState<{pid: string, node: string, runId?: string, config?: any} | null>(null);
  
  // 2. View State
  const [selectedNode, setSelectedNode] = useState<string>("cloud-243");
  const [selectedRunId, setSelectedRunId] = useState<string>(""); 
  
  // 3. Comparison State (Restored)
  const [comparisonRuns, setComparisonRuns] = useState<ComparisonRun[]>([]);

  // 4. Data & Lists
  const [historyRuns, setHistoryRuns] = useState<{id: string, display: string}[]>([]);
  const [availableNodes, setAvailableNodes] = useState<string[]>([]);
  
  // 5. Metrics & Config
  const [metrics, setMetrics] = useState<any[]>([]);
  const [runConfig, setRunConfig] = useState<any>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res = await fetch('/api/gpu-nodes');
        const data = await res.json();
        if (data.gpus) {
          const uniqueNodes = Array.from(new Set(data.gpus.map((g: any) => g.nodeName)));
          setAvailableNodes(uniqueNodes as string[]);
          if (uniqueNodes.length > 0 && !selectedNode) {
             setSelectedNode(uniqueNodes[0] as string);
          }
        }
      } catch (e) { console.error("Failed to fetch nodes", e); }
    };
    fetchNodes();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("activeRun");
    if (saved) {
      try { setActiveRun(JSON.parse(saved)); } 
      catch (e) { localStorage.removeItem("activeRun"); }
    }
  }, []);

  const fetchHistory = async () => {
    try {
        const res = await fetch(`/api/list-runs?nodeName=${selectedNode}`);
        const data = await res.json();
        let runs = data.runs || [];

        // Inject Live Run if applicable
        if (activeRun && activeRun.node === selectedNode && activeRun.runId) {
            const liveEntry = {
                id: activeRun.runId,
                display: `▶ LIVE: Run ${activeRun.runId.replace('run_', '')} (Running...)`
            };
            runs = runs.filter((r: any) => r.id !== activeRun.runId);
            runs.unshift(liveEntry);
        }

        setHistoryRuns(runs);
        
        // Auto-select first if empty
        if (runs.length > 0 && !selectedRunId) {
            setSelectedRunId(runs[0].id);
        }
    } catch (e) { console.error("Failed to load history list", e); }
  };
  
  useEffect(() => { fetchHistory(); }, [activeRun, selectedNode]); 

  const mergeMetrics = (runsData: any[], runsMeta: ComparisonRun[]) => {
      const stepMap = new Map<number, any>();
      runsData.forEach((runData, index) => {
          const meta = runsMeta[index];
          const runKey = meta.id;
          runData.forEach((point: any) => {
              if (!stepMap.has(point.step)) stepMap.set(point.step, { step: point.step });
              const entry = stepMap.get(point.step);
              // Map dynamic keys like 'loss_run_123' for the chart lines
              entry[`loss_${runKey}`] = point.loss;
              entry[`perplexity_${runKey}`] = point.perplexity || Math.exp(point.loss);
              entry[`lr_${runKey}`] = point.learning_rate;
              entry[`gpu_${runKey}`] = point.gpu_mem_GB;
          });
      });
      return Array.from(stepMap.values()).sort((a, b) => a.step - b.step);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeRun) {
      const checkStatus = async () => {
        try {
            const statusRes = await fetch('/api/check-run-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: activeRun.pid, nodeName: activeRun.node, runId: activeRun.runId }),
            });
            const statusData = await statusRes.json();

            if (statusRes.ok && statusData.isRunning === false) {
                const finishedRun = activeRun;
                setActiveRun(null);
                localStorage.removeItem("activeRun");
                
                if (selectedNode === finishedRun.node) {
                    fetchHistory();
                    if (statusData.status === 'success') {
                        alert(`Training Run ${finishedRun.runId} Completed Successfully!`);
                    } else {
                        alert(`Training Run ${finishedRun.runId} Failed or Stopped.`);
                    }
                }
            }
        } catch(e) { console.error("Status poll error", e); }
      };
      checkStatus();
      interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [activeRun, selectedNode]);

  useEffect(() => {
    const fetchData = async () => {
      
      if (comparisonRuns.length > 0) {
          try {
              const promises = comparisonRuns.map(run => {
                  const isLive = activeRun && run.id === activeRun.runId && run.node === activeRun.node;
                  const rid = isLive ? 'latest' : run.id;
                  return fetch(`/api/attention-metrics?nodeName=${run.node}&runId=${rid}`).then(r => r.json());
              });

              const results = await Promise.all(promises);
              const allData = results.map(r => r.data || []);
              
              const merged = mergeMetrics(allData, comparisonRuns);
              setMetrics(merged);
              
          } catch (e) { console.error("Comparison fetch error", e); }
      } 
      else if (selectedRunId) {
          try {
            const isViewingLive = activeRun && selectedRunId === activeRun.runId && selectedNode === activeRun.node;
            const runIdParam = isViewingLive ? 'latest' : selectedRunId;

            const res = await fetch(`/api/attention-metrics?nodeName=${selectedNode}&runId=${runIdParam}`);
            const responseData = await res.json();
            
            // Normalize single run data to 'default' keys
            const normalizedData = (responseData.data || []).map((d: any) => ({
                ...d,
                loss_default: d.loss,
                perplexity_default: d.perplexity || Math.exp(d.loss),
                lr_default: d.learning_rate,
                gpu_default: d.gpu_mem_GB,
            }));

            setMetrics(normalizedData);
            setRunConfig(responseData.config || null);
            setRunResult(responseData.result || null); 
          } catch(e) { console.error("Single fetch error", e); }
      }
    };

    fetchData();
    // Poll faster if viewing live run
    const isViewingLive = activeRun && (selectedRunId === activeRun.runId || comparisonRuns.some(c => c.id === activeRun.runId));
    const interval = setInterval(fetchData, isViewingLive ? 2000 : 10000);
    return () => clearInterval(interval);
  }, [activeRun, selectedRunId, selectedNode, comparisonRuns]);

  const handleStart = async (flatConfig: any, nodeName: string) => {
      setIsModalOpen(false);
      try {
        const safeConfig = {
            task: flatConfig.task, 
            model: flatConfig.model, 
            dataset: flatConfig.dataset,   
            attention: flatConfig.attention, 
            learning_rate: flatConfig.learning_rate,
            sequence_length: flatConfig.sequence_length,
            training: { 
                max_steps: flatConfig.steps || 100, 
                per_device_train_batch_size: flatConfig.batch_size, 
                learning_rate: flatConfig.learning_rate 
            }
        };

        const res = await fetch('/api/start-training', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: safeConfig, nodeName }),
        });
        const data = await res.json();
        
        if (res.ok) {
           const newRun = { pid: data.pid, node: nodeName, runId: data.runId, config: flatConfig };
           setActiveRun(newRun);
           localStorage.setItem("activeRun", JSON.stringify(newRun));
           setSelectedNode(nodeName);
           setSelectedRunId(data.runId);
        } else { alert("Failed to start: " + data.error); }
      } catch (e: any) { alert("Error starting training: " + e.message); }
  };

  const handleStop = async () => {
     if (!activeRun) return;
     if (!confirm("Stop the current training run?")) return;
     try {
       await fetch('/api/cancel-training', {
         method: 'POST', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ pid: activeRun.pid, nodeName: activeRun.node }),
       });
     } catch (e) { alert("Failed to stop run"); }
  };

  // COMPARISON HANDLERS ---
  const handleAddComparison = () => {
    if (!selectedRunId) return;
    
    // Prevent duplicates
    if (comparisonRuns.some(r => r.id === selectedRunId)) return;
    
    // Find display name from history
    const runInfo = historyRuns.find(r => r.id === selectedRunId);
    if (!runInfo) return;

    // Assign color based on index
    const color = CHART_COLORS[comparisonRuns.length % CHART_COLORS.length];

    setComparisonRuns([
      ...comparisonRuns,
      { id: selectedRunId, node: selectedNode, display: runInfo.display, color }
    ]);
  };

  const handleRemoveComparison = (id: string) => {
    setComparisonRuns(comparisonRuns.filter(r => r.id !== id));
  };

  const formatDuration = (seconds: number) => {
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const m = Math.floor(seconds / 60);
      const s = (seconds % 60).toFixed(0);
      return `${m}m ${s}s`;
  };

  const chartRuns = comparisonRuns.length > 0 
      ? comparisonRuns 
      : [{ id: 'default', node: selectedNode, display: selectedRunId.replace('run_', 'Run '), color: '#22D3EE' }];

  return (
    <div className="space-y-6">
      
      {/* 1. Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start bg-gray-800/50 p-4 rounded-lg border border-gray-700 gap-4">
        
        <div className="flex-1">
           <h2 className="text-xl font-bold flex items-center gap-3 text-white">
             ML Training Monitor
             {activeRun && activeRun.node === selectedNode && selectedRunId === activeRun.runId && (
                <span className="flex items-center gap-2 text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded border border-green-700/50 animate-pulse">
                    <HiPlay /> Live Training
                </span>
             )}
           </h2>
           <p className="text-gray-400 text-sm mt-1">
             View successful benchmark runs or track live progress.
           </p>
        </div>

        <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
                {/* Node Selector */}
                <div className="relative">
                    <select 
                        className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none min-w-[130px] pl-8 cursor-pointer"
                        value={selectedNode}
                        onChange={(e) => {
                            setSelectedNode(e.target.value);
                            setSelectedRunId(""); 
                        }}
                    >
                        {availableNodes.map(node => (
                            <option key={node} value={node}>{node}</option>
                        ))}
                    </select>
                    <HiServer className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none"/>
                </div>

                {/* Run Selector */}
                <div className="relative">
                    <select 
                        className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none max-w-[250px] cursor-pointer"
                        value={selectedRunId}
                        onChange={(e) => setSelectedRunId(e.target.value)}
                    >
                        {historyRuns.length === 0 && <option value="">No Runs Found</option>}
                        {historyRuns.map(run => (
                            <option key={run.id} value={run.id}>{run.display}</option>
                        ))}
                    </select>
                </div>

                <button 
                    onClick={handleAddComparison}
                    disabled={!selectedRunId || comparisonRuns.some(r => r.id === selectedRunId)}
                    className="p-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 hover:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Add to Comparison"
                >
                    <HiPlus className="text-cyan-400 w-5 h-5" />
                </button>

                {activeRun ? (
                   <button 
                     onClick={handleStop} 
                     className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-semibold shadow-lg shadow-red-900/20 transition-all flex items-center gap-2"
                   >
                     Stop Active Run
                   </button>
                ) : (
                   <button 
                     onClick={() => setIsModalOpen(true)} 
                     className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-sm font-semibold shadow-lg shadow-cyan-900/20 transition-all flex items-center gap-2"
                   >
                     <HiPlus /> New Run
                   </button>
                )}
            </div>
        </div>
      </div>

      {comparisonRuns.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm text-gray-400 flex items-center gap-1 self-center mr-2">
                <HiChartBar /> Comparing:
            </span>
            {comparisonRuns.map(run => (
                <div 
                    key={run.id} 
                    className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-gray-900 border border-gray-700 shadow-sm"
                    style={{ borderLeftColor: run.color, borderLeftWidth: '4px' }}
                >
                    <span className="text-gray-200">{run.display}</span>
                    <button 
                        onClick={() => handleRemoveComparison(run.id)}
                        className="text-gray-500 hover:text-red-400"
                    >
                        <HiX className="w-3 h-3" />
                    </button>
                </div>
            ))}
            <button 
                onClick={() => setComparisonRuns([])}
                className="text-xs text-gray-500 hover:text-gray-300 underline self-center ml-2"
            >
                Clear all
            </button>
        </div>
      )}

      {/* 2. Detailed Parameter & Result Panel */}
      {(runConfig || runResult) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Parameters Card */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 shadow-lg">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2 mb-4">
                    <h3 className="text-gray-300 font-bold flex items-center gap-2">
                        <HiAdjustments className="text-cyan-400" /> Run Configuration 
                        <span className="text-xs font-normal text-gray-500 hidden sm:inline">
                            ({selectedRunId.replace('run_', '')})
                        </span>
                    </h3>
                    <button 
                        onClick={() => window.open(`/api/download-run?nodeName=${selectedNode}&runId=${selectedRunId}&file=config`, '_blank')}
                        className="text-xs flex items-center gap-1 text-cyan-500 hover:text-cyan-400 font-medium transition-colors"
                        title="Download Config JSON"
                    >
                        <HiDownload className="w-4 h-4" /> Config
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-2 text-sm">
                    <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Model</div>
                        <div className="text-white font-mono truncate" title={runConfig?.model_name}>{runConfig?.model_name || "-"}</div>
                    </div>
                    <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Task</div>
                        <div className="text-white font-mono">{runConfig?.task || "-"}</div>
                    </div>
                    <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Attention</div>
                        <div className="text-cyan-400 font-mono">{runConfig?.attention?.ui_choice || "-"}</div>
                    </div>
                    <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Batch Size</div>
                        <div className="text-white font-mono">{runConfig?.training?.per_device_train_batch_size || "-"}</div>
                    </div>
                    <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Learning Rate</div>
                        <div className="text-white font-mono">{runConfig?.training?.learning_rate || "-"}</div>
                    </div>
                     <div>
                        <div className="text-gray-500 text-xs uppercase font-bold">Sequence Len</div>
                        <div className="text-white font-mono">{runConfig?.dataset?.max_input_len || "-"}</div>
                    </div>
                </div>
            </div>

            {/* Results Card */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 shadow-lg relative overflow-hidden">
                {runResult ? (
                    <>
                        <div className="flex justify-between items-center border-b border-gray-800 pb-2 mb-4">
                            <h3 className="text-gray-300 font-bold flex items-center gap-2">
                                <HiCheckCircle className="text-green-400" /> Benchmark Results
                            </h3>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => window.open(`/api/download-run?nodeName=${selectedNode}&runId=${selectedRunId}&file=results`, '_blank')}
                                    className="text-xs flex items-center gap-1 text-green-500 hover:text-green-400 font-medium transition-colors"
                                    title="Download Results Summary"
                                >
                                    <HiDownload className="w-4 h-4" /> Summary
                                </button>
                                <button 
                                    onClick={() => window.open(`/api/download-run?nodeName=${selectedNode}&runId=${selectedRunId}&file=logs`, '_blank')}
                                    className="text-xs flex items-center gap-1 text-gray-400 hover:text-white font-medium transition-colors"
                                    title="Download Full Logs"
                                >
                                    <HiDownload className="w-4 h-4" /> Logs
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                            <div className="bg-gray-800/50 p-2 rounded">
                                <div className="text-gray-500 text-xs uppercase font-bold flex items-center gap-1"><HiLightningBolt/> Throughput</div>
                                <div className="text-xl font-mono text-white">{runResult.eval_metrics?.eval_samples_per_second?.toFixed(1) || "0.0"} <span className="text-xs text-gray-500">samples/s</span></div>
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded">
                                <div className="text-gray-500 text-xs uppercase font-bold flex items-center gap-1"><HiChip/> Peak VRAM</div>
                                <div className="text-xl font-mono text-yellow-400">{runResult.gpu_mem_GB} <span className="text-xs text-gray-500">GB</span></div>
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded">
                                <div className="text-gray-500 text-xs uppercase font-bold flex items-center gap-1"><HiChartBar/> Final Loss</div>
                                <div className="text-xl font-mono text-green-400">{runResult.eval_loss?.toFixed(4) || runResult.train_loss?.toFixed(4) || "-"}</div>
                            </div>
                            <div className="bg-gray-800/50 p-2 rounded">
                                <div className="text-gray-500 text-xs uppercase font-bold flex items-center gap-1"><HiClock/> Duration</div>
                                <div className="text-xl font-mono text-white">{formatDuration(runResult.training_time_sec)}</div>
                            </div>
                        </div>
                    </>
                ) : (
                     <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                        {activeRun && selectedRunId === activeRun.runId ? (
                             <>
                                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-2"></div>
                                <p className="text-sm">Benchmarking in progress...</p>
                             </>
                        ) : (
                            <p className="text-sm">Select a successful run to view results.</p>
                        )}
                     </div>
                )}
            </div>
        </div>
      )}

      {/* 3. Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TrainingLossChart data={metrics} runs={chartRuns} />
          <TrainingPerplexityChart data={metrics} runs={chartRuns} />
          <LearningRateChart data={metrics} runs={chartRuns} />
          <ResourceChart data={metrics} runs={chartRuns} />
      </div>

      <NewRunModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onStart={handleStart} isLoading={false} />
    </div>
  );
}