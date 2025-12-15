import { NodeSSH } from 'node-ssh';
import { NodeConfig } from '@/types/cluster';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    ),
  ]);
};

export async function createConnection(node: Partial<NodeConfig>): Promise<NodeSSH> {
  const ssh = new NodeSSH();
  
  const username = process.env.SSH_USER || node.user;
  const password = process.env.SSH_PASSWORD; // Fallback to node prop if needed (rare)
  const keyOrPath = process.env.SSH_PRIVATE_KEY;

  if (!username) throw new Error(`[SSH] No username for ${node.name}. Check .env`);
  
  let sshConfig: any = {
    host: node.host,
    port: node.port,
    username: username,
    readyTimeout: 43000, 
    tryKeyboard: true
  };

  if (password) sshConfig.password = password;
  
  if (keyOrPath) {
    if (keyOrPath.includes('-----BEGIN')) {
      sshConfig.privateKey = keyOrPath;
    } else {
      sshConfig.privateKeyPath = keyOrPath;
    }
  }

  if (!password && !keyOrPath) {
    throw new Error(`[SSH] No password or private key found for ${node.name}.`);
  }

  try {
    await withTimeout(ssh.connect(sshConfig), 43000);
    return ssh;
  } catch (error: any) {
    ssh.dispose();
    console.error(`[SSH] Connection Failed ${node.name || 'Unknown'}: ${error.message}`);
    throw error;
  }
}

export async function runCommand(node: Partial<NodeConfig>, command: string, timeoutMs: number = 43000): Promise<string> {
  let ssh: NodeSSH | null = null;
  
  try {
    ssh = await createConnection(node);
    const result = await withTimeout(ssh.execCommand(command), timeoutMs);
    
    if (result.stderr && result.code !== 0) {
      console.warn(`[SSH] ${node.name} (Code ${result.code}): ${result.stderr.slice(0, 100)}...`);
    }

    return result.stdout;
  } finally {
    if (ssh) ssh.dispose();
  }
}