import { NodeSSH } from 'node-ssh';
import { NodeConfig } from '@/types/cluster';

// Helper to timeout a promise
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
 * @param timeoutMs Default 60000ms (60s). Increased to support slow nodes.
 */
export async function runCommand(node: NodeConfig, command: string, timeoutMs: number = 60000): Promise<string> {
  const ssh = new NodeSSH();
  
  const username = process.env.SSH_USERNAME || node.user;
  const password = process.env.SSH_PASSWORD;
  const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;

  try {
    // 1. Connect (Give it 20s to handshake)
    await withTimeout(
      ssh.connect({
        host: node.host,
        port: node.port,
        username: username,
        password: password,
        privateKeyPath: privateKeyPath,
        readyTimeout: 20000, 
      }),
      20000
    );

    // 2. Execute with Custom Timeout
    const result = await withTimeout(ssh.execCommand(command), timeoutMs);

    ssh.dispose();

    // 3. Return stdout even if code is non-zero (so we can handle || true in bash)
    if (result.code !== 0) {
      console.warn(`[SSH] ${node.name}: Command returned code ${result.code}`);
      // Return output anyway, often contains useful error info or partial data
      return result.stdout; 
    }

    return result.stdout;

  } catch (error) {
    ssh.dispose();
    console.error(`[SSH] ${node.name} Connection Error: ${(error as Error).message}`);
    return "";
  }
}