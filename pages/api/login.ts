// File: pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Client } from 'ssh2';

interface AuthResponse {
  token?: string;
  status?: string;
  error?: string;
  details?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AuthResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // SSH connection configuration (fixed IP, user/password from input)
  const sshConfig = {
    host: '139.174.16.243', // University server IP
    port: 22, // Default SSH port
    username,
    password,
    readyTimeout: 10000,
  };

  try {
    // Attempt SSH connection to verify credentials
    const isValid = await verifySSHCredentials(sshConfig);

    if (isValid) {
      // Generate a session token (you should use JWT or similar in production)
      const token = generateSessionToken(username);

      return res.status(200).json({
        token,
        status: 'success'
      });
    } else {
      return res.status(401).json({
        error: 'Invalid university credentials'
      });
    }
  } catch (err: any) {
    console.error('SSH Auth Error:', err.message);

    return res.status(500).json({
      error: 'Connection to university server failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

// Verify SSH credentials by attempting connection
function verifySSHCredentials(config: any): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let resolved = false;

    // Timeout handler - close connection if it takes too long
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          conn.end();
          conn.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(new Error('SSH connection timeout'));
      }
    }, config.readyTimeout || 10000);

    const cleanup = () => {
      clearTimeout(timeout);
      try {
        conn.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    };

    conn.on('ready', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.log('[SSH Auth] Connection verified successfully, connection closed.');
        resolve(true);
      }
    });

    conn.on('error', (err: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        // Check if error is authentication failure
        if (err.message.includes('authentication') || err.message.includes('All configured authentication methods failed')) {
          console.log('[SSH Auth] Authentication failed, connection closed.');
          resolve(false);
        } else {
          console.error('[SSH Auth] Connection error:', err.message);
          reject(err);
        }
      }
    });

    conn.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log('[SSH Auth] Connection closed unexpectedly.');
        resolve(false);
      }
    });

    conn.connect(config);
  });
}

// Generate a session token (use JWT in production)
function generateSessionToken(username: string): string {
  // This is a simplified example - use proper JWT with signing in production
  const payload = {
    username,
    timestamp: Date.now(),
    expiresAt: Date.now() + (3600 * 1000) // 1 hour
  };

  // In production, use jsonwebtoken library:
  // import jwt from 'jsonwebtoken';
  // return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}