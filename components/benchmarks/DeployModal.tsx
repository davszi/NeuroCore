import React, { useState, useEffect } from 'react';
import { HiX, HiServer, HiChip, HiCloudUpload, HiCheckCircle, HiExclamationCircle } from 'react-icons/hi';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeployModal({ isOpen, onClose }: Props) {
  const [selectedNode, setSelectedNode] = useState(CLUSTER_NODES.find(n => n.hasGpu)?.name || CLUSTER_NODES[0].name);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  // Automated path
  const installPath = getInstallPath(selectedNode);

  // Polling for status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && status === 'uploading') {
        const poll = async () => {
            try {
                const res = await fetch(`/api/deploy?jobId=${jobId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.logs) setLogs(data.logs);
                if (data.status === 'success') {
                    setStatus('success');
                    clearInterval(interval);
                }
                if (data.status === 'error') {
                    setStatus('error');
                    clearInterval(interval);
                }
            } catch (e) {
                console.error("Poll error", e);
            }
        };
        poll();
        interval = setInterval(poll, 1000);
    }
    return () => clearInterval(interval);
  }, [jobId, status]);

  const handleDeploy = async () => {
    setStatus('uploading');
    setLogs([]);
    setJobId(null);

    try {
        const res = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeName: selectedNode })
        });
        
        const data = await res.json();
        if (data.success) {
            setJobId(data.jobId);
        } else {
            setStatus('error');
            setLogs([`API Error: ${data.error}`]);
        }
    } catch (e: any) {
        setStatus('error');
        setLogs([`Request Error: ${e.message}`]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HiCloudUpload className="text-cyan-400" />
            Deploy Backend Engine
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <HiX className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Configuration Form */}
          <div className="grid gap-6 mb-6">
             
             {/* Node Selection */}
             <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Target Cloud Node</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CLUSTER_NODES.filter(n => n.hasGpu).map(node => (
                        <button
                            key={node.name}
                            onClick={() => {
                                setSelectedNode(node.name);
                                setStatus('idle'); // Reset status on change
                                setLogs([]);
                            }}
                            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                                selectedNode === node.name 
                                ? 'bg-cyan-900/30 border-cyan-500 ring-1 ring-cyan-500' 
                                : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                            }`}
                        >
                            <HiChip className={selectedNode === node.name ? "text-cyan-400" : "text-gray-500"} />
                            <div>
                                <div className={`font-semibold ${selectedNode === node.name ? 'text-white' : 'text-gray-300'}`}>
                                    {node.name}
                                </div>
                                <div className="text-xs text-gray-500">{node.host}</div>
                            </div>
                        </button>
                    ))}
                </div>
             </div>

             {/* Auto-Path Info */}
             <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Installation Path (Automated)</label>
                <div className="font-mono text-cyan-300 text-sm flex items-center gap-2">
                    <HiServer className="text-gray-500" />
                    {installPath}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Files will be uploaded to this path on <strong>{selectedNode}</strong>. The virtual environment will be created automatically using the system credentials.
                </p>
             </div>
          </div>

          {/* Logs Console */}
          <div className="bg-black rounded-lg border border-gray-800 p-4 h-64 overflow-y-auto font-mono text-xs shadow-inner">
             {logs.length === 0 ? (
                <div className="text-gray-600 italic">Ready to deploy...</div>
             ) : (
                logs.map((log, i) => (
                    <div key={i} className={`mb-1 border-b border-gray-900 pb-0.5 ${
                        log.includes('Error') ? 'text-red-400' : 
                        log.includes('Success') || log.includes('Complete') ? 'text-green-400' : 
                        'text-gray-300'
                    }`}>
                        {log}
                    </div>
                ))
             )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-800 flex justify-between items-center bg-gray-900/50 rounded-b-xl">
           <div className="flex items-center gap-2">
                {status === 'success' && <span className="flex items-center gap-2 text-green-400 text-sm font-semibold"><HiCheckCircle /> Deployment Successful</span>}
                {status === 'error' && <span className="flex items-center gap-2 text-red-400 text-sm font-semibold"><HiExclamationCircle /> Deployment Failed</span>}
           </div>

           <button 
             onClick={handleDeploy}
             disabled={status === 'uploading'}
             className={`px-6 py-2.5 rounded-lg font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                 status === 'uploading' 
                 ? 'bg-gray-600 cursor-not-allowed opacity-70' 
                 : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 hover:shadow-cyan-500/20'
             }`}
           >
             {status === 'uploading' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deploying...
                </>
             ) : (
                <>
                   <HiCloudUpload className="w-5 h-5" />
                   Start Deployment
                </>
             )}
           </button>
        </div>

      </div>
    </div>
  );
}