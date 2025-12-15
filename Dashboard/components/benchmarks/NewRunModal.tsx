import React, { useState, useEffect } from 'react';
import { HiX, HiLightningBolt, HiServer } from 'react-icons/hi';
import { useCluster } from '@/context/ClusterContext';
import { TrainingJobConfig } from '@/types/cluster';

const OPTIONS = {
  tasks: ["summarization", "translation", "text-generation"],
  models: ["t5-small", "t5-base", "bert-base-uncased", "gpt2"],
  datasets: ["cnn_dailymail", "wmt16", "wikitext"],
  attention: ["flash", "sdpa", "eager"],
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: TrainingJobConfig, nodeName: string) => void;
  isLoading: boolean;
}

export default function NewRunModal({ isOpen, onClose, onStart, isLoading }: Props) {

  const { nodesState } = useCluster();
  const gpuNodes = nodesState?.gpu_nodes || [];
  const [selectedNode, setSelectedNode] = useState("");
  const [config, setConfig] = useState<TrainingJobConfig>({
    task: OPTIONS.tasks[0],
    model: OPTIONS.models[0],
    dataset: OPTIONS.datasets[0],
    attention: OPTIONS.attention[0],
    steps: 100,
    batch_size: 32,
    learning_rate: 5e-5
  });

  useEffect(() => {
    if (gpuNodes.length > 0 && !selectedNode) {
      setSelectedNode(gpuNodes[0].node_name);
    }
  }, [gpuNodes, selectedNode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg p-6 shadow-2xl relative">
        
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <HiX className="w-6 h-6" />
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <HiLightningBolt className="text-cyan-400" />
          Start New Training Run
        </h2>

        <div className="space-y-4">
          
          <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
            <label className="block">
              <span className="text-cyan-400 text-sm font-semibold flex items-center gap-2">
                <HiServer /> Target GPU Node
              </span>
              <select 
                className="w-full mt-1 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
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

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Task</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.task} 
                onChange={e => setConfig({...config, task: e.target.value})}
              >
                {OPTIONS.tasks.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Model</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.model} 
                onChange={e => setConfig({...config, model: e.target.value})}
              >
                {OPTIONS.models.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Attention</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.attention} 
                onChange={e => setConfig({...config, attention: e.target.value})}
              >
                {OPTIONS.attention.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm font-semibold">Dataset</span>
              <select 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.dataset} 
                onChange={e => setConfig({...config, dataset: e.target.value})}
              >
                {OPTIONS.datasets.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label>
              <span className="text-gray-400 text-sm font-semibold">Steps</span>
              <input 
                type="number" 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                value={config.steps} 
                onChange={e => setConfig({...config, steps: parseInt(e.target.value)})} 
              />
            </label>
            <label>
              <span className="text-gray-400 text-sm font-semibold">Batch Size</span>
              <input 
                type="number" 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                value={config.batch_size} 
                onChange={e => setConfig({...config, batch_size: parseInt(e.target.value)})} 
              />
            </label>
            <label>
              <span className="text-gray-400 text-sm font-semibold">LR</span>
              <input 
                type="number" 
                step="0.00001" 
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                value={config.learning_rate} 
                onChange={e => setConfig({...config, learning_rate: parseFloat(e.target.value)})} 
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
            onClick={() => onStart(config, selectedNode)} 
            disabled={isLoading || !selectedNode}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded flex items-center gap-2 transition-colors"
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