import { NextApiRequest, NextApiResponse } from 'next';
import { createConnection } from '@/lib/ssh';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { nodeName, runId, file } = req.query;

  if (!nodeName || !runId || !file) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as unknown as NodeConfig;
  if (!targetNode) return res.status(404).json({ error: 'Node not found' });

  let ssh;
  try {
    const APP_ROOT = getInstallPath(targetNode.name);
    const runDir = `${APP_ROOT}/outputs/${runId}`;
    
    // Map requested file type to actual filename
    let filename = "";
    if (file === "config") filename = "config.json";
    else if (file === "results") filename = "run_metrics.jsonl";
    else if (file === "logs") filename = "step_metrics.jsonl";
    else return res.status(400).json({ error: "Invalid file type" });

    const remotePath = `${runDir}/${filename}`;

    ssh = await createConnection(targetNode);
    
    // Check if file exists
    const check = await ssh.execCommand(`[ -f "${remotePath}" ] && echo "yes" || echo "no"`);
    if (check.stdout.trim() !== "yes") {
        return res.status(404).json({ error: "File not found on remote server" });
    }

    // Read file content
    // Note: For very large logs, SFTP streams are better, but for JSON benchmarks 'cat' is stable and fast.
    const result = await ssh.execCommand(`cat "${remotePath}"`);

    if (result.stderr) {
        throw new Error(`Read error: ${result.stderr}`);
    }

    // Set Headers for Download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${runId}_${filename}"`);
    res.status(200).send(result.stdout);

  } catch (error: any) {
    console.error(`[Download API] Error:`, error.message);
    res.status(500).json({ error: "Download failed" });
  } finally {
    if (ssh) ssh.dispose();
  }
}