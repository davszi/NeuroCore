import React, { useState, useEffect } from 'react';
import { HiX, HiLightningBolt, HiServer } from 'react-icons/hi';
import { useCluster } from '@/context/ClusterContext';

// --- CONFIGURATION MAPPING ---
const VALID_CONFIGS: Record<string, { 
    label: string; 
    models: string[]; 
    datasets: string[]; 
    max_seq: number;     
    default_seq: number;  
}> = {
  "summarization": {
    label: "Summarization",
    models: ["t5-small", "facebook/bart-base"],
    datasets: ["cnn_dailymail"],
    max_seq: 1024,       
    default_seq: 512
  },
  "classification": {
    label: "Classification",
    models: ["distilbert-base-uncased", "albert-base-v2"],
    datasets: ["dair-ai/emotion"],
    max_seq: 512,        
    default_seq: 128  
  },
  "text-generation": {
    label: "Text Generation (Causal LM)", 
    models: ["gpt2", "Qwen/Qwen2.5-0.5B-Instruct"],
    datasets: ["roneneldan/TinyStories"],
    max_seq: 2048,      
    default_seq: 1024
  }
};

const ATTENTION_OPTIONS = ["flash", "sdpa", "sequential"];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: any, nodeName: string) => void;
  isLoading: boolean;
}

export default function NewRunModal({ isOpen, onClose, onStart, isLoading }: Props) {

  const { nodesState } = useCluster();
  const gpuNodes = nodesState?.gpu_nodes || [];
  const [selectedNode, setSelectedNode] = useState("");
  
  // State
  const [task, setTask] = useState("text-generation");
  const [model, setModel] = useState("");
  const [dataset, setDataset] = useState("");
  const [attention, setAttention] = useState("flash");
  
  // Hyperparameters
  const [steps, setSteps] = useState(100); 
  const [batchSize, setBatchSize] = useState(32);
  const [lr, setLr] = useState(5e-5);
  
  // Sequence Length State
  const [seqLength, setSeqLength] = useState(1024);

  // --- DEPENDENT DROPDOWN LOGIC ---
  useEffect(() => {
    const validOptions = VALID_CONFIGS[task];
    if (validOptions) {
      setModel(validOptions.models[0]);
      setDataset(validOptions.datasets[0]);
      
      if (seqLength > validOptions.max_seq) {
          setSeqLength(validOptions.max_seq);
      } else {
          setSeqLength(validOptions.default_seq);
      }
    }
  }, [task]);

  useEffect(() => {
    if (gpuNodes.length > 0 && !selectedNode) {
      setSelectedNode(gpuNodes[0].node_name);
    }
  }, [gpuNodes, selectedNode]);

  if (!isOpen) return null;

  const handleStart = () => {
    const config = {
      task,
      model,
      dataset,
      attention,
      steps, 
      batch_size: batchSize,
      learning_rate: lr,
      sequence_length: seqLength 
    };
    onStart(config, selectedNode);
  };

  const currentConfig = VALID_CONFIGS[task];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200">
      
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg p-6 shadow-2xl relative">
        
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <HiX className="w-6 h-6" />
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <HiLightningBolt className="text-cyan-400" />
          Start New Training Run
        </h2>

        <div className="space-y-5">
          
          {/* Node Selection */}
          <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
            <label className="block">
              <span className="text-cyan-400 text-sm font-semibold flex items-center gap-2 mb-1">
                <HiServer /> Target GPU Node
              </span>
              <select 
                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                value={selectedNode}
                onChange={e => setSelectedNode(e.target.value)}
              >
                {gpuNodes.length === 0 ? (
                  <option disabled>No GPU Nodes Available</option>
                ) : (
                  gpuNodes.map(node => (
                    <option key={node.node_name} value={node.node_name}>
                      {node.node_name} ({node.gpus.length}x {node.gpus[0]?.gpu_name || "GPU"})
                    </option>
                  ))
                )}
              </select>
            </label>
            {gpuNodes.length === 0 && (
              <p className="text-xs text-red-400 mt-2">
                No GPU nodes detected. Please check dashboard status.
              </p>
            )}
          </div>

          {/* Task & Model Selection */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Task</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none"
                value={task} 
                onChange={e => setTask(e.target.value)}
              >
                {Object.entries(VALID_CONFIGS).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Model</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none"
                value={model} 
                onChange={e => setModel(e.target.value)}
              >
                {currentConfig.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          {/* Attention & Dataset */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Attention Impl.</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none"
                value={attention} 
                onChange={e => setAttention(e.target.value)}
              >
                {ATTENTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Dataset</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none"
                value={dataset} 
                onChange={e => setDataset(e.target.value)}
              >
                {currentConfig.datasets.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          {/* Hyperparameters */}
          <div className="grid grid-cols-3 gap-4">
            <label>
              <span className="text-gray-400 text-sm font-semibold">Training Steps</span>
              <input 
                type="number" 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none" 
                value={steps} 
                onChange={e => setSteps(parseInt(e.target.value))} 
                min={10}
              />
            </label>
            <label>
              <span className="text-gray-400 text-sm font-semibold">Batch Size</span>
              <input 
                type="number" 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none" 
                value={batchSize} 
                onChange={e => setBatchSize(parseInt(e.target.value))} 
              />
            </label>
            
            <label>
              <span className="text-gray-400 text-sm font-semibold flex justify-between">
                Seq Length 
                <span className="text-xs text-gray-500">Max: {currentConfig.max_seq}</span>
              </span>
              <input 
                type="number" 
                className={`w-full mt-1 bg-gray-800 border rounded p-2 text-white focus:outline-none transition-colors ${
                    seqLength > currentConfig.max_seq ? 'border-red-500 focus:border-red-500' : 'border-gray-700 focus:border-cyan-500'
                }`}
                value={seqLength} 
                onChange={e => setSeqLength(parseInt(e.target.value))} 
              />
            </label>
          </div>

          {/* Validation Warning */}
          {seqLength > currentConfig.max_seq && (
             <p className="text-xs text-red-400 mt-[-10px] text-center">
                ⚠️ {model} supports max {currentConfig.max_seq} tokens.
             </p>
          )}

          <div className="mt-2">
            <label className="block">
                <span className="text-gray-400 text-sm font-semibold">LR</span>
                <input 
                    type="number" 
                    step="0.00001" 
                    className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 outline-none" 
                    value={lr} 
                    onChange={e => setLr(parseFloat(e.target.value))} 
                />
            </label>
          </div>

        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleStart} 
            disabled={isLoading || !selectedNode || seqLength > currentConfig.max_seq}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded flex items-center gap-2 transition-colors shadow-lg shadow-cyan-900/20"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              'Start Training'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}