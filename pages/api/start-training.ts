import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import { createConnection } from '@/lib/ssh';
import { CLUSTER_NODES, getInstallPath } from '@/lib/config';
import { NodeConfig } from '@/types/cluster';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { config, nodeName } = req.body;
  if (!config || !nodeName) {
    return res.status(400).json({ error: 'Missing config or nodeName' });
  }

  const targetNode = CLUSTER_NODES.find(n => n.name === nodeName) as NodeConfig;
  if (!targetNode) {
    return res.status(400).json({ error: `Node '${nodeName}' not found` });
  }

  // Generate Run ID
  const ts = Math.floor(Date.now() / 1000);
  const runId = `run_${ts}`;

  const APP_ROOT = getInstallPath(targetNode.name);
  const CACHE_ROOT = `${APP_ROOT}/caches`;
  const OUTPUT_ROOT = `${APP_ROOT}/outputs`;
  const LOGS_ROOT = `${APP_ROOT}/logs`;

  const localConfigPath = `/tmp/config_${ts}.json`;
  const localLauncherPath = `/tmp/launcher_${ts}.sh`;

  const remoteConfigPath = `/tmp/training_config_${ts}.json`;
  const remoteLauncherPath = `/tmp/start_${ts}.sh`;
  
  // Paths for persistent logs
  const remoteLogPath = `${LOGS_ROOT}/${runId}.log`;
  const remoteStatusPath = `${LOGS_ROOT}/${runId}_status.json`;

  let ssh;

  try {
    // ---- 1. Write Local Config ----
    const deployConfig = {
      ...config,
      general: {
        ...config.general,
        base_output_dir: OUTPUT_ROOT,
      },
    };

    fs.writeFileSync(localConfigPath, JSON.stringify(deployConfig, null, 2), { mode: 0o600 });

    // ---- 2. Write Wrapper Script (The Fix) ----
    // This script runs the workload in a background block { ... } & 
    // and immediately echoes the PID of that block.
    const launcherScript = `#!/bin/bash
export UV_CACHE_DIR="${CACHE_ROOT}/uv"
export HF_HOME="${CACHE_ROOT}/huggingface"

mkdir -p "${LOGS_ROOT}"
cd "${APP_ROOT}" || exit 1

if [ -x "venv/bin/python" ]; then
  PY="venv/bin/python"
else
  PY="python3"
fi

# Run everything in a background subshell
{
  # Write INITIAL status using the subshell's PID
  echo "{\\"status\\": \\"running\\", \\"pid\\": $BASHPID}" > "${remoteStatusPath}"

  # Run Python (Redirecting all output to the log file)
  "$PY" main.py --config "${remoteConfigPath}" > "${remoteLogPath}" 2>&1
  EXIT_CODE=$?

  # Write FINAL status based on exit code
  if [ $EXIT_CODE -eq 0 ]; then
    echo "{\\"status\\": \\"success\\", \\"exit_code\\": 0}" > "${remoteStatusPath}"
  else
    echo "{\\"status\\": \\"failed\\", \\"exit_code\\": $EXIT_CODE}" > "${remoteStatusPath}"
  fi
} > /dev/null 2>&1 &

# Print the PID of the background process we just started
echo $!
`;

    fs.writeFileSync(localLauncherPath, launcherScript, { mode: 0o700 });

    // ---- 3. Connect & Upload ----
    ssh = await createConnection(targetNode);

    // Create directories
    await ssh.execCommand(`mkdir -p ${CACHE_ROOT} ${OUTPUT_ROOT} ${LOGS_ROOT}`);

    // Upload files
    await ssh.putFile(localConfigPath, remoteConfigPath);
    await ssh.execCommand(`chmod 600 ${remoteConfigPath}`);

    await ssh.putFile(localLauncherPath, remoteLauncherPath);
    await ssh.execCommand(`chmod +x ${remoteLauncherPath}`);

    // ---- 4. Execute ----
    // We run the launcher normally. It exits instantly after spawning the background job.
    const result = await ssh.execCommand(`/bin/bash ${remoteLauncherPath}`);

    // Parse PID
    const lines = result.stdout.trim().split('\n');
    const pid = lines[lines.length - 1].trim();

    if (!pid || !/^[0-9]+$/.test(pid)) {
      console.error("Start Failed Output:", result.stdout, result.stderr);
      throw new Error(`Failed to get PID. stdout: ${result.stdout}`);
    }

    // Cleanup (small delay to ensure bash is done reading the file)
    // We do NOT delete the config yet, Python needs it.
    await ssh.execCommand(`sleep 0.1 && rm -f ${remoteLauncherPath}`);

    return res.status(200).json({
      success: true,
      node: targetNode.name,
      pid,
      runId,
      log: remoteLogPath,
    });

  } catch (err: any) {
    console.error('API ERROR:', err.message);
    // Include details so the UI alert shows the real reason
    return res.status(500).json({
      error: 'Failed to start training',
      details: err.message,
    });
  } finally {
    if (fs.existsSync(localConfigPath)) fs.unlinkSync(localConfigPath);
    if (fs.existsSync(localLauncherPath)) fs.unlinkSync(localLauncherPath);
    if (ssh) ssh.dispose();
  }
}