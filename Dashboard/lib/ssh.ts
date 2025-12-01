// lib/ssh.ts
import { NodeSSH } from 'node-ssh';
import { NodeConfig } from '@/types/cluster';

// Helper to timeout a promise if it takes too long
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    ),
  ]);
};

/**
 * Executes a command on a remote node securely.
 * Returns the stdout string if successful, or empty string if failed
 * It will NOT crash the app if a node is offline
 */
export async function runCommand(node: NodeConfig, command: string): Promise<string> {
  const ssh = new NodeSSH();
  
  // 1. Get Credentials from node config or environment
  // Priority: node.password > SSH_PASSWORD env var
  const username = process.env.SSH_USERNAME || node.user;
  const password = node.password || process.env.SSH_PASSWORD;
  const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

  try {
    // 2. Connect with a strict 5-second timeout
    await withTimeout(
      ssh.connect({
        host: node.host,
        port: node.port,
        username: username,
        password: password,
        privateKeyPath: privateKeyPath,
        readyTimeout: 5000, 
        // If you get "handshake failed", try adding: algorithms: { serverHostKey: ['ssh-rsa', 'ssh-dss'] }
      }),
      5000
    );

    // 3. Execute
    const result = await ssh.execCommand(command);

    // 4. Clean up
    ssh.dispose();

    if (result.code !== 0) {
      // Log warning but don't crash
      console.warn(`[SSH] ${node.name}: Command returned exit code ${result.code}`);
      return ""; 
    }

    return result.stdout;

  } catch (error) {
    ssh.dispose();
    // Log error but don't crash
    console.error(`[SSH] ${node.name} Connection Error: ${(error as Error).message}`);
    return "";
  }
}