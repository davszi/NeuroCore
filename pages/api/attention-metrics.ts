import { NextApiRequest, NextApiResponse } from 'next';
import { runCommand } from '@/lib/ssh';
import { CLUSTER_NODES } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';
import { getSettings } from '@/lib/settings-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodeName, runId } = req.query;

  if (!nodeName) return res.status(400).json({ error: 'Missing nodeName' });

  try {
    const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
    if (!targetNode) return res.status(404).json({ error: 'Node not found' });

    const { remotePath } = getSettings();
    const OUTPUTS_DIR = `${remotePath}/outputs`;

    let runDir = "";

    // 1. Resolve Run Directory
    if (runId && runId !== 'latest') {
        runDir = `${OUTPUTS_DIR}/${runId}`;
    } else {
        const findCmd = `ls -td ${OUTPUTS_DIR}/run_* | head -1`;
        const newestRun = await runCommand(targetNode, findCmd);
        
        if (!newestRun || !newestRun.trim()) {
            return res.status(200).json({ data: [], config: null, result: null }); 
        }
        runDir = newestRun.trim();
    }

    // 2. Fetch CONFIG (Metadata)
    let config = null;
    try {
        const configRaw = await runCommand(targetNode, `cat "${runDir}/config.json"`);
        if (configRaw && configRaw.trim()) {
            config = JSON.parse(configRaw.trim());
        }
    } catch (e) {
        // Config might be missing for failed runs
    }

    // 3. Fetch FINAL RESULTS (Summary)
    let result = null;
    try {
        const resultRaw = await runCommand(targetNode, `tail -n 1 "${runDir}/run_metrics.jsonl"`);
        if (resultRaw && resultRaw.trim()) {
            result = JSON.parse(resultRaw.trim());
        }
    } catch (e) {
        // Result file only exists after training finishes successfully
    }

    // 4. Fetch METRICS (Live Charts)
    let metrics: any[] = [];
    try {
        const metricsRaw = await runCommand(targetNode, `cat "${runDir}/step_metrics.jsonl"`);
        metrics = metricsRaw
            .trim()
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                try { return JSON.parse(line); } 
                catch (e) { return null; }
            })
            .filter(item => item !== null);
    } catch (e) {
        // Metrics might be empty for new runs
    }

    // 5. Return Everything
    res.status(200).json({ data: metrics, config, result });

  } catch (error: any) {
    console.error(`[Metrics API] Fatal Error: ${error.message}`);
    res.status(200).json({ data: [], config: null, result: null });
  }
}