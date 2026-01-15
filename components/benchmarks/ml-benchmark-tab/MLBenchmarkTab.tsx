import React, { useState, useEffect } from 'react';
import { HiLightningBolt, HiClock, HiChartBar, HiChip } from 'react-icons/hi'; // Icons for the summary
import TrainingLossChart from './TrainingLossChart';
import TrainingPerplexityChart from './TrainingPerplexityChart';
import NewRunModal from './NewRunModal';
import LearningRateChart from './LearningRateChart';
import ResourceChart from './ResourceChart';

interface Props {
  activeTab: string;
}

export default function MLBenchmarkTab({ activeTab }: Props) {
  
  // --- STATE ---
  const [activeRun, setActiveRun] = useState<{pid: string, node: string, runId?: string, config?: any} | null>(null);
  const [historyRuns, setHistoryRuns] = useState<{id: string, display: string}[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("latest");
  const [metrics, setMetrics] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [runConfig, setRunConfig] = useState<any>(null);
  const [runResult, setRunResult] = useState<any>(null); // [NEW] Stores final benchmark results

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
        const node = activeRun?.node || 'cloud-243';
        const res = await fetch(`/api/list-runs?nodeName=${node}`);
        const data = await res.json();
        if (data.runs) {
            setHistoryRuns(data.runs);
            if (!activeRun && selectedRunId === "latest" && data.runs.length > 0) {
                setSelectedRunId(data.runs[0].id);
            }
        }
    } catch (e) { console.error("Failed to load history list", e); }
  };
  useEffect(() => { fetchHistory(); }, [activeRun]); 

  // --- EFFECT 3: Main Polling Loop ---
  useEffect(() => {
    const fetchData = async () => {
      const runQuery = activeRun ? 'latest' : selectedRunId;
      const nodeQuery = activeRun?.node || 'cloud-243';

      try {
        // 1. Fetch Metrics, Config, AND Result
        const res = await fetch(`/api/attention-metrics?nodeName=${nodeQuery}&runId=${runQuery}`);
        const responseData = await res.json();
        
        setMetrics(responseData.data || []);
        setRunConfig(responseData.config || null);
        setRunResult(responseData.result || null); 

        // 2. Check Status if Running
        if (activeRun) {
            const statusRes = await fetch('/api/check-run-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    pid: activeRun.pid, 
                    nodeName: activeRun.node, 
                    runId: activeRun.runId 
                }),
            });
            const statusData = await statusRes.json();

            if (statusRes.ok && statusData.isRunning === false) {
                console.log(`Run finished with status: ${statusData.status}`);
                setActiveRun(null);
                localStorage.removeItem("activeRun");
                fetchHistory(); 
                
                if (statusData.status === 'success') alert("Training Finished Successfully! 🎉");
                else if (statusData.status === 'failed') alert("Training Failed! Check logs.");
                else alert("Training Stopped.");
            }
        }
      } catch (e) { console.error("Polling error", e); }
    };

    fetchData();
    const interval = setInterval(fetchData, activeRun ? 5000 : 10000);
    return () => clearInterval(interval);
  }, [activeRun, selectedRunId]);

  // --- HANDLERS ---
  const handleStart = async (flatConfig: any, nodeName: string) => {
      setIsModalOpen(false);
      try {
        const safeConfig = {
            task: flatConfig.task,
            model: flatConfig.model,       
            dataset: flatConfig.dataset,   
            attention: flatConfig.attention, 
            learning_rate: flatConfig.learning_rate,
            per_device_train_batch_size: flatConfig.batch_size,
            training: {
                num_train_epochs: flatConfig.epochs || 5, 
                logging_steps: 5,                        
                eval_steps: 5,
                save_steps: 50,
                per_device_train_batch_size: flatConfig.batch_size,
                learning_rate: flatConfig.learning_rate,
            }
        };

        const res = await fetch('/api/start-training', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: safeConfig, nodeName }),
        });
        const data = await res.json();
        
        if (res.ok) {
           const newRun = { pid: data.pid, node: nodeName, runId: data.runId, config: flatConfig };
           setActiveRun(newRun);
           localStorage.setItem("activeRun", JSON.stringify(newRun));
           setMetrics([]); 
        } else {
           alert("Failed to start: " + data.error);
        }
      } catch (e: any) {
        alert("Error starting training: " + e.message);
      }
  };

  const handleStop = async () => {
     if (!activeRun) return;
     if (!confirm("Stop the current training run?")) return;
     try {
       await fetch('/api/cancel-training', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ pid: activeRun.pid, nodeName: activeRun.node }),
       });
       setActiveRun(null);
       localStorage.removeItem("activeRun");
     } catch (e) { alert("Failed to stop run"); }
  };

  // --- HELPER: Format Duration ---
  const formatDuration = (seconds: number) => {
      if (seconds < 60) return `${seconds.toFixed(1)}s`;
      const m = Math.floor(seconds / 60);
      const s = (seconds % 60).toFixed(0);
      return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-800/50 p-4 rounded-lg border border-gray-700 gap-4">
        <div>
           <h2 className="text-xl font-bold flex items-center gap-3 text-white">
             ML Training Monitor
             {activeRun && (
                <span className="flex items-center gap-2 text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded border border-green-700/50">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Live
                </span>
             )}
           </h2>
           <div className="text-gray-400 text-sm mt-1 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
             {runConfig ? (
               <>
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
               </>
             ) : (
                <span>{activeRun ? "Loading details..." : "Select a run to view details."}</span>
             )}
           </div>
        </div>

        <div className="flex items-center gap-4">
            {!activeRun && historyRuns.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 hidden md:inline">History:</span>
                    <select 
                        className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 outline-none min-w-[200px]"
                        value={selectedRunId}
                        onChange={(e) => setSelectedRunId(e.target.value)}
                    >
                        {historyRuns.map(run => (
                            <option key={run.id} value={run.id}>{run.display}</option>
                        ))}
                    </select>
                </div>
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

      {/* BENCHMARK RESULT SUMMARY CARD */}
      {runResult && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-lg p-5 shadow-xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-4">
                <HiLightningBolt className="text-yellow-400 w-5 h-5" />
                <h3 className="text-md font-bold text-white uppercase tracking-wider">Benchmark Results</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Duration */}
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1">
                        <HiClock /> Duration
                    </div>
                    <div className="text-xl font-mono text-white">
                        {formatDuration(runResult.training_time_sec)}
                    </div>
                </div>

                {/* Speed */}
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1">
                        <HiLightningBolt /> Throughput
                    </div>
                    <div className="text-xl font-mono text-cyan-400">
                        {runResult.eval_metrics?.eval_samples_per_second?.toFixed(1) || "-"} <span className="text-sm text-gray-500">s/sec</span>
                    </div>
                </div>

                {/* Final Loss */}
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1">
                        <HiChartBar /> Eval Loss
                    </div>
                    <div className="text-xl font-mono text-green-400">
                        {runResult.eval_loss?.toFixed(4) || runResult.train_loss?.toFixed(4)}
                    </div>
                </div>

                {/* VRAM */}
                <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                    <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase mb-1">
                        <HiChip /> Peak VRAM
                    </div>
                    <div className="text-xl font-mono text-yellow-400">
                        {runResult.gpu_mem_GB} <span className="text-sm text-gray-500">GB</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TrainingLossChart data={metrics} />
          <TrainingPerplexityChart data={metrics} />
          <LearningRateChart data={metrics} />
          <ResourceChart data={metrics} />
      </div>

      <NewRunModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onStart={handleStart}
        isLoading={false}
      />
    </div>
  );
}