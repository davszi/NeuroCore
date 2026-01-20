import React, { useState, useEffect } from 'react';
import { HiLightningBolt, HiClock, HiChartBar, HiChip, HiServer, HiPlus, HiX } from 'react-icons/hi'; 
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
  const [activeRun, setActiveRun] = useState<{pid: string, node: string, runId?: string, config?: any} | null>(null);
  const [historyRuns, setHistoryRuns] = useState<{id: string, display: string}[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("latest");
  
  // Comparison State
  const [comparisonRuns, setComparisonRuns] = useState<ComparisonRun[]>([]);
  
  // Data State
  const [metrics, setMetrics] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [runConfig, setRunConfig] = useState<any>(null);
  const [runResult, setRunResult] = useState<any>(null);

  // Node Selection
  const [selectedNode, setSelectedNode] = useState<string>("cloud-243");
  const [availableNodes, setAvailableNodes] = useState<string[]>([]);

  // --- EFFECT 0: Load Available Nodes ---
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
      } catch (e) {
        console.error("Failed to fetch nodes", e);
      }
    };
    fetchNodes();
  }, []);

  // --- EFFECT 1: Load Active Run ---
  useEffect(() => {
    const saved = localStorage.getItem("activeRun");
    if (saved) {
      try { setActiveRun(JSON.parse(saved)); } 
      catch (e) { localStorage.removeItem("activeRun"); }
    }
  }, []);

  // --- EFFECT 2: Fetch History ---
  const fetchHistory = async () => {
    try {
        const node = activeRun?.node || selectedNode;
        const res = await fetch(`/api/list-runs?nodeName=${node}`);
        const data = await res.json();
        if (data.runs) {
            setHistoryRuns(data.runs);
            if (!activeRun && data.runs.length > 0) {
                // Check if current selectedRunId exists in this new list
                const currentExists = data.runs.find((r: any) => r.id === selectedRunId);
                // If not found, switch to the first available run to prevent mismatch
                if (!currentExists) {
                   setSelectedRunId(data.runs[0].id);
                }
            } else if (data.runs.length === 0) {
                setHistoryRuns([]); 
                if (!activeRun) setSelectedRunId(""); // Clear selection if no runs
            }
        }
    } catch (e) { console.error("Failed to load history list", e); }
  };
  
  useEffect(() => { fetchHistory(); }, [activeRun, selectedNode]); 

  // --- HELPER: Merge Metrics for Comparison ---
  const mergeMetrics = (runsData: any[], runsMeta: ComparisonRun[]) => {
      const stepMap = new Map<number, any>();

      runsData.forEach((runData, index) => {
          const meta = runsMeta[index];
          const runKey = meta.id; // Unique key for this run

          runData.forEach((point: any) => {
              if (!stepMap.has(point.step)) {
                  stepMap.set(point.step, { step: point.step });
              }
              const entry = stepMap.get(point.step);
              
              // Prefix metrics with run ID for the chart
              entry[`loss_${runKey}`] = point.loss;
              entry[`perplexity_${runKey}`] = point.perplexity || Math.exp(point.loss);
              entry[`lr_${runKey}`] = point.learning_rate;
              entry[`gpu_${runKey}`] = point.gpu_mem_GB;
              entry[`ram_${runKey}`] = point.ram_usage_GB;
          });
      });

      return Array.from(stepMap.values()).sort((a, b) => a.step - b.step);
  };

  // --- EFFECT 3: Main Data Fetcher ---
  useEffect(() => {
    const fetchData = async () => {
      
      // A. LIVE MODE (Active Run)
      if (activeRun) {
         try {
            const res = await fetch(`/api/attention-metrics?nodeName=${activeRun.node}&runId=latest`);
            const responseData = await res.json();
            
            // Normalize for single view
            const normalizedData = (responseData.data || []).map((d: any) => ({
                ...d,
                loss_default: d.loss,
                perplexity_default: d.perplexity || Math.exp(d.loss),
                lr_default: d.learning_rate,
                gpu_default: d.gpu_mem_GB,
                ram_default: d.ram_usage_GB
            }));

            setMetrics(normalizedData);
            setRunConfig(responseData.config || null);
            setRunResult(responseData.result || null); 

            // Check Status
            const statusRes = await fetch('/api/check-run-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: activeRun.pid, nodeName: activeRun.node, runId: activeRun.runId }),
            });
            const statusData = await statusRes.json();

            if (statusRes.ok && statusData.isRunning === false) {
                setActiveRun(null);
                localStorage.removeItem("activeRun");
                fetchHistory(); 
                if (statusData.status === 'success') alert("Training Finished Successfully! 🎉");
                else alert("Training Stopped.");
            }
         } catch(e) { console.error("Polling error", e); }
         return;
      }

      // B. COMPARISON MODE (Multiple Runs)
      if (comparisonRuns.length > 0) {
          try {
              const requests = comparisonRuns.map(run => 
                  fetch(`/api/attention-metrics?nodeName=${run.node}&runId=${run.id}`).then(r => r.json())
              );
              const results = await Promise.all(requests);
              const allMetrics = results.map(r => r.data || []);
              
              const merged = mergeMetrics(allMetrics, comparisonRuns);
              setMetrics(merged);
              setRunConfig(null); 
              setRunResult(null);
          } catch(e) { console.error("Comparison fetch error", e); }
          return;
      }

      // C. PREVIEW MODE (Single Selected Run)
      if (selectedRunId) {
          try {
            const res = await fetch(`/api/attention-metrics?nodeName=${selectedNode}&runId=${selectedRunId}`);
            const responseData = await res.json();
            
            const normalizedData = (responseData.data || []).map((d: any) => ({
                ...d,
                loss_default: d.loss,
                perplexity_default: d.perplexity || Math.exp(d.loss),
                lr_default: d.learning_rate,
                gpu_default: d.gpu_mem_GB,
                ram_default: d.ram_usage_GB
            }));

            setMetrics(normalizedData);
            setRunConfig(responseData.config || null);
            setRunResult(responseData.result || null); 
          } catch(e) { console.error("Preview fetch error", e); }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, activeRun ? 5000 : 10000);
    return () => clearInterval(interval);
  }, [activeRun, selectedRunId, selectedNode, comparisonRuns]); 

  // --- HANDLERS ---
  const handleAddToCompare = () => {
      if (comparisonRuns.length >= 5) {
          alert("Maximum 5 runs allowed for comparison.");
          return;
      }
      
      const runId = selectedRunId;
      // Prevent duplicates
      if (comparisonRuns.some(r => r.id === runId && r.node === selectedNode)) return;

      const runDisplay = historyRuns.find(r => r.id === runId)?.display || runId;
      
      const newRun: ComparisonRun = {
          id: runId,
          node: selectedNode,
          display: `${selectedNode} - ${runDisplay.split('(')[0].replace('Run ', '')}`,
          color: CHART_COLORS[comparisonRuns.length % CHART_COLORS.length]
      };

      setComparisonRuns([...comparisonRuns, newRun]);
  };

  const handleRemoveFromCompare = (index: number) => {
      const newRuns = [...comparisonRuns];
      newRuns.splice(index, 1);
      setComparisonRuns(newRuns);
  };

  // ... (Keep handleStart and handleStop same as before)
  const handleStart = async (flatConfig: any, nodeName: string) => {
      setIsModalOpen(false);
      try {
        const safeConfig = {
            task: flatConfig.task, model: flatConfig.model, dataset: flatConfig.dataset,   
            attention: flatConfig.attention, learning_rate: flatConfig.learning_rate,
            per_device_train_batch_size: flatConfig.batch_size,
            training: { num_train_epochs: flatConfig.epochs || 5, logging_steps: 5, eval_steps: 5, save_steps: 50, per_device_train_batch_size: flatConfig.batch_size, learning_rate: flatConfig.learning_rate }
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
           setMetrics([]); 
           setComparisonRuns([]);
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
       setActiveRun(null);
       localStorage.removeItem("activeRun");
     } catch (e) { alert("Failed to stop run"); }
  };

  const formatDuration = (seconds: number) => {
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const m = Math.floor(seconds / 60);
      const s = (seconds % 60).toFixed(0);
      return `${m}m ${s}s`;
  };

  const currentChartRuns = activeRun 
      ? [{ id: 'default', node: activeRun.node, display: 'Live Run', color: '#22D3EE' }]
      : comparisonRuns.length > 0
          ? comparisonRuns
          : [{ id: 'default', node: selectedNode, display: 'Preview', color: '#22D3EE' }];

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-start bg-gray-800/50 p-4 rounded-lg border border-gray-700 gap-4">
        
        <div className="flex-1">
           <h2 className="text-xl font-bold flex items-center gap-3 text-white">
             ML Training Monitor
             {activeRun && (
                <span className="flex items-center gap-2 text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded border border-green-700/50">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span> Live
                </span>
             )}
           </h2>
           
           <div className="mt-2 min-h-[28px]">
             {comparisonRuns.length > 0 && !activeRun ? (
                 <div className="flex flex-wrap gap-2">
                     {comparisonRuns.map((run, idx) => (
                         <div key={`${run.id}-${idx}`} className="flex items-center gap-2 px-2 py-1 bg-gray-900 rounded border border-gray-600 text-xs">
                             <span className="w-2 h-2 rounded-full" style={{ backgroundColor: run.color }}></span>
                             <span className="text-gray-200">{run.display}</span>
                             <button onClick={() => handleRemoveFromCompare(idx)} className="text-gray-500 hover:text-red-400">
                                <HiX className="w-3 h-3" />
                             </button>
                         </div>
                     ))}
                 </div>
             ) : runConfig ? (
               <div className="text-gray-400 text-sm flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                 <span className="flex items-center gap-1">
                   <span className="text-cyan-400 font-mono">Model:</span> {runConfig.model_name}
                 </span>
                 <span className="hidden md:inline text-gray-700">|</span>
                 <span className="flex items-center gap-1">
                   <span className="text-cyan-400 font-mono">Attn:</span> {runConfig.attention?.ui_choice}
                 </span>
                 <span className="hidden md:inline text-gray-700">|</span>
                 <span className="flex items-center gap-1">
                   <span className="text-cyan-400 font-mono">Task:</span> {runConfig.task}
                 </span>
               </div>
             ) : (
                <span className="text-gray-500 text-sm">{activeRun ? "Loading details..." : "Select a run to view details or compare."}</span>
             )}
           </div>
        </div>

        <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
                {!activeRun && (
                  <>
                      <div className="relative">
                        <select 
                            className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none min-w-[130px] pl-8 cursor-pointer"
                            value={selectedNode}
                            onChange={(e) => setSelectedNode(e.target.value)}
                        >
                            {availableNodes.map(node => (
                                <option key={node} value={node}>{node}</option>
                            ))}
                        </select>
                        <HiServer className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none"/>
                      </div>

                      {historyRuns.length > 0 && (
                        <div className="relative">
                            <select 
                                className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none max-w-[200px] cursor-pointer"
                                value={selectedRunId}
                                onChange={(e) => setSelectedRunId(e.target.value)}
                            >
                                {historyRuns.map(run => (
                                    <option key={run.id} value={run.id}>{run.display}</option>
                                ))}
                            </select>
                        </div>
                      )}

                      <button 
                        onClick={handleAddToCompare}
                        disabled={!selectedRunId || historyRuns.length === 0}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Add current selection to comparison view"
                      >
                        <HiPlus className="w-4 h-4" />
                      </button>
                  </>
                )}
                
                {activeRun ? (
                   <button onClick={handleStop} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-md text-sm font-semibold shadow-lg shadow-red-900/20 transition-all active:scale-95">
                     Stop Run
                   </button>
                ) : (
                   <button onClick={() => setIsModalOpen(true)} className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2 rounded-md text-sm font-semibold shadow-lg shadow-cyan-900/20 transition-all active:scale-95 flex items-center gap-2">
                     <span>+</span> New Run
                   </button>
                )}
            </div>
        </div>
      </div>

      {runResult && comparisonRuns.length === 0 && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-lg p-5 shadow-xl animate-in fade-in slide-in-from-top-2">
            {/* ... Summary Card Content ... */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1"><HiClock /> Duration</div>
                    <div className="text-xl font-mono text-white">{formatDuration(runResult.training_time_sec)}</div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1"><HiLightningBolt /> Throughput</div>
                    <div className="text-xl font-mono text-cyan-400">{runResult.eval_metrics?.eval_samples_per_second?.toFixed(1) || "-"} <span className="text-sm text-gray-500">s/sec</span></div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1"><HiChartBar /> Eval Loss</div>
                    <div className="text-xl font-mono text-green-400">{runResult.eval_loss?.toFixed(4) || runResult.train_loss?.toFixed(4)}</div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1"><HiChip /> Peak VRAM</div>
                    <div className="text-xl font-mono text-yellow-400">{runResult.gpu_mem_GB} <span className="text-sm text-gray-500">GB</span></div>
                </div>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TrainingLossChart data={metrics} runs={currentChartRuns} />
          <TrainingPerplexityChart data={metrics} runs={currentChartRuns} />
          <LearningRateChart data={metrics} runs={currentChartRuns} />
          <ResourceChart data={metrics} runs={currentChartRuns} />
      </div>

      <NewRunModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onStart={handleStart} isLoading={false} />
    </div>
  );
}