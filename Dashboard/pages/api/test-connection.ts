import { NextApiRequest, NextApiResponse } from 'next';
import { NodeSSH } from 'node-ssh'; // We use the node-ssh library

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  // 1. --- SSH Connection Details ---
  // ℹ️ These are the details for the REAL server
  const ssh = new NodeSSH();
  const connectionConfig = {
    host: 'cloud-247.rz.tu-clausthal.de',
    port: 22,
    username: 'mw86', // ❗️ Make sure this is your Uni-ID
    password: 'phie9aw7Lee7', // ❗️ Put your university password here
  };

  console.log('API Route /api/test-connection: Attempting to connect...');

  try {
    // 2. --- Connect ---
    await ssh.connect(connectionConfig);

    console.log('Connection successful. Running "hostname"...');

    // 3. --- Run a Simple Command ---
    // We just run 'hostname' to prove it works.
    const result = await ssh.execCommand('hostname');

    // 4. --- Send Success Response ---
    console.log('Command successful. Hostname:', result.stdout);
    ssh.dispose();
    res.status(200).json({ status: 'success', hostname: result.stdout });

  } catch (e) {
    // 5. --- Send Error Response ---
    const errorMessage = (e as Error).message || 'Unknown error';
    console.error('Connection or command failed:', errorMessage);
    ssh.dispose();
    res.status(500).json({ status: 'error', message: errorMessage });
  }
}