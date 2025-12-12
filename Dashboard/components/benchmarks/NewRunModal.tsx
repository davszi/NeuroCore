import { useState } from 'react';
import { TrainingJobConfig } from '@/types/cluster';
import { HiX } from 'react-icons/hi';

const OPTIONS = {
  tasks: ["summarization", "translation", "text-generation"],
  models: ["t5-small", "t5-base", "bert-base-uncased", "gpt2"],
  datasets: ["cnn_dailymail", "wmt16", "wikitext"],
  attention: ["flash", "sdpa", "eager"],
  // Add your GPU nodes here
  nodes: ["cloud-243", "cloud-244"] 
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: TrainingJobConfig, nodeName: string) => void; // Updated signature
  isLoading: boolean;
}

export default function NewRunModal({ isOpen, onClose, onStart, isLoading }: Props) {
  const [selectedNode, setSelectedNode] = useState(OPTIONS.nodes[0]); // Default to first GPU node
  const [config, setConfig] = useState<TrainingJobConfig>({
    task: OPTIONS.tasks[0],
    model: OPTIONS.models[0],
    dataset: OPTIONS.datasets[0],
    attention: OPTIONS.attention[0],
    steps: 100,
    batch_size: 32,
    learning_rate: 5e-5
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><HiX className="w-6 h-6" /></button>
        <h2 className="text-xl font-bold text-white mb-6">Start New Training Run</h2>

        <div className="space-y-4">
          {/* --- NEW: Node Selector --- */}
          <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
            <label className="block">
              <span className="text-cyan-400 text-sm font-semibold">Target GPU Node</span>
              <select 
                className="w-full mt-1 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:ring-2 focus:ring-cyan-500"
                value={selectedNode}
                onChange={e => setSelectedNode(e.target.value)}
              >
                {OPTIONS.nodes.map(n => <option key={n} value={n}>{n} (GPU)</option>)}
              </select>
            </label>
          </div>

          {/* ... (Existing Dropdowns for Task, Model, etc.) ... */}
          <div className="grid grid-cols-2 gap-4">
             {/* Same code as before for Task/Model... */}
             <label className="block">
              <span className="text-gray-400 text-sm">Task</span>
              <select className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.task} onChange={e => setConfig({...config, task: e.target.value})}>
                {OPTIONS.tasks.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm">Model</span>
              <select className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.model} onChange={e => setConfig({...config, model: e.target.value})}>
                {OPTIONS.models.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
          {/* ... (Rest of your inputs: Attention, Dataset, Steps...) ... */}
           <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-gray-400 text-sm">Attention Type</span>
              <select className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.attention} onChange={e => setConfig({...config, attention: e.target.value})}>
                {OPTIONS.attention.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-400 text-sm">Dataset</span>
              <select className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white"
                value={config.dataset} onChange={e => setConfig({...config, dataset: e.target.value})}>
                {OPTIONS.datasets.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
           <div className="grid grid-cols-3 gap-4">
            <label><span className="text-gray-400 text-sm">Steps</span><input type="number" className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" value={config.steps} onChange={e => setConfig({...config, steps: parseInt(e.target.value)})} /></label>
            <label><span className="text-gray-400 text-sm">Batch Size</span><input type="number" className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" value={config.batch_size} onChange={e => setConfig({...config, batch_size: parseInt(e.target.value)})} /></label>
            <label><span className="text-gray-400 text-sm">LR</span><input type="number" step="0.00001" className="w-full mt-1 bg-gray-800 border border-gray-700 rounded p-2 text-white" value={config.learning_rate} onChange={e => setConfig({...config, learning_rate: parseFloat(e.target.value)})} /></label>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Cancel</button>
          <button 
            onClick={() => onStart(config, selectedNode)} // Pass the node!
            disabled={isLoading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? 'Starting...' : 'Start Training'}
          </button>
        </div>
      </div>
    </div>
  );
}