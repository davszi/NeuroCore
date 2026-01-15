import { CLUSTER_NODES } from '@/lib/config';
import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [creds, setCreds] = useState({ 
    host: 'cloud-243.rz.tu-clausthal.de', 
    username: '', 
    password: '', 
    remotePath: '/scratch/neurocore-app' 
  });
  
  const [status, setStatus] = useState('idle'); 
  const [logs, setLogs] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [installPath, setInstallPath] = useState<string | null>(null);

  // --- POLLING LOGIC ---
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (jobId && (status === 'uploading' || status === 'installing')) {
        // Poll immediately once
        fetchStatus();

        // Then poll every 30 seconds
        interval = setInterval(fetchStatus, 30000); 
    }

    async function fetchStatus() {
        if (!jobId) return;
        try {
            const res = await fetch(`/api/deploy?jobId=${jobId}`);
            const data = await res.json();
            
            if (data.logs) setLogs(data.logs);
            if (data.status === 'success') {
                setStatus('success');
                setInstallPath(data.installPath);
                clearInterval(interval);
            }
            if (data.status === 'error') {
                setStatus('error');
                clearInterval(interval);
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }

    return () => clearInterval(interval);
  }, [jobId, status]);

  const handleDeploy = async () => {
    setStatus('uploading');
    setLogs(['Starting deployment request...']);
    
    try {
        const res = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds)
        });
        const data = await res.json();
        
        if (data.jobId) {
            setJobId(data.jobId);
        } else {
            throw new Error("Server did not return a Job ID");
        }
    } catch (err: any) {
        setStatus('error');
        setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans text-slate-800">
      <h1 className="text-3xl font-bold mb-8 text-slate-900">System Settings & Deployment</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Connection Panel */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">📡 Connection Details</h2>
            <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Host Server</label>
                  <select 
                    className="w-full px-3 py-2 border rounded bg-white"
                    value={creds.host}
                    onChange={e => setCreds({...creds, host: e.target.value})}
                  >
                    {CLUSTER_NODES.map(node => (
                        <option key={node.name} value={node.host}>
                            {node.name} ({node.hasGpu ? 'GPU Node' : 'CPU Node'})
                        </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <input className="w-full px-3 py-2 border rounded" value={creds.username} onChange={e => setCreds({...creds, username: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input type="password" className="w-full px-3 py-2 border rounded" value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Directory</label>
                  <input className="w-full px-3 py-2 border rounded" value={creds.remotePath} onChange={e => setCreds({...creds, remotePath: e.target.value})} />
                </div>
            </div>
        </div>

        {/* Status Panel */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 flex flex-col">
           <h2 className="text-xl font-semibold mb-4">🚀 Deploy Python Backend</h2>
           
           <div className="flex-1 mb-4">
             <div className="bg-slate-900 text-slate-50 p-4 rounded-md h-64 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
                {logs.length === 0 ? "> Waiting to start..." : logs.map((log, i) => (
                    <div key={i} className="mb-1 border-b border-slate-800 pb-1">{log}</div>
                ))}
             </div>
           </div>

           {status === 'success' && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
                    <strong>✅ Success!</strong><br/>
                    Backend installed at: <code className="bg-green-100 px-1 rounded">{installPath}</code>
                </div>
           )}

           <button 
             onClick={handleDeploy}
             disabled={status === 'uploading' || !creds.password}
             className={`w-full py-2 px-4 rounded font-medium text-white shadow-sm transition-colors ${
                 status === 'uploading' ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
             }`}
           >
             {status === 'uploading' ? 'Deploying (Check logs)...' : 'Deploy & Install Now'}
           </button>
        </div>

      </div>
    </div>
  );
}