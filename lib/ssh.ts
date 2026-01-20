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

interface ConnectOptions {
  readyTimeout?: number;
}

export async function createConnection(node: Partial<NodeConfig>, options?: ConnectOptions): Promise<NodeSSH> {
  const ssh = new NodeSSH();

  const username = process.env.SSH_USER || node.user;
  const password = process.env.SSH_PASSWORD; // Fallback to node prop if needed (rare)
  const keyOrPath = process.env.SSH_PRIVATE_KEY;

  if (!username) throw new Error(`[SSH] No username for ${node.name}. Check .env`);

  let sshConfig: any = {
    host: node.host,
    port: node.port,
    username: username,
    readyTimeout: options?.readyTimeout || 20000, // Reduced default from 43s to 20s
    tryKeyboard: true,
    agent: false, // Explicitly false to disable agent
    // Setup handling for keyboard-interactive (some servers demand this instead of password)
    onKeyboardInteractive: (name: string, instructions: string, instructionsLang: string, prompts: any[], finish: Function) => {
      if (prompts.length > 0 && password) {
        finish(prompts.map((_: any) => password));
      } else {
        finish([]);
      }
    },
    // Explicit algorithms - using algorithms supported by ssh2 library
    algorithms: {
      serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
      cipher: ['chacha20-poly1305@openssh.com', 'aes256-gcm@openssh.com', 'aes128-gcm@openssh.com', 'aes256-ctr', 'aes192-ctr', 'aes128-ctr'],
      hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512'],
      kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1']
    }
  };

  // DEBUG: Check if credentials exist (do not log actual password)
  console.log(`[SSH Debug] Connecting to ${node.name} as ${username}. Has Password: ${!!password}, Has Key: ${!!keyOrPath}`);

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

  let attempts = 0;
  const maxAttempts = 5;
  let lastError: any;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      await withTimeout(ssh.connect(sshConfig), 43000);
      return ssh;
    } catch (error: any) {
      lastError = error;
      console.warn(`[SSH] Connection attempt ${attempts}/${maxAttempts} failed for ${node.name}: ${error.message}`);

      // If error is about auth failure, it might be rate limiting. Wait a bit.
      if (attempts < maxAttempts) {
        const waitTime = 5000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  ssh.dispose();
  console.error(`[SSH] Connection Failed ${node.name || 'Unknown'} after ${maxAttempts} attempts: ${lastError?.message}`);
  throw lastError;
}

export async function runCommand(
  node: Partial<NodeConfig>,
  command: string,
  timeoutMs: number = 43000,
  existingConnection?: NodeSSH
): Promise<string> {
  let ssh: NodeSSH | null = existingConnection || null;
  const shouldDispose = !existingConnection;

  try {
    if (!ssh) {
      ssh = await createConnection(node);
    }
    const result = await withTimeout(ssh.execCommand(command), timeoutMs);

    if (result.stderr && result.code !== 0) {
      console.warn(`[SSH] ${node.name} (Code ${result.code}): ${result.stderr.slice(0, 100)}...`);
    }

    return result.stdout;
  } finally {
    if (shouldDispose && ssh) ssh.dispose();
  }
}