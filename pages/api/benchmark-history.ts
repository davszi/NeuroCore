import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { range = 'month' } = req.query;
        const historyDir = path.join(process.cwd(), 'data/node-history');

        if (!fs.existsSync(historyDir)) {
            return res.status(200).json({ data: [] });
        }

        // Get all snapshot files
        const files = fs.readdirSync(historyDir)
            .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
            .sort()
            .reverse();

        // Calculate cutoff based on range
        const now = Date.now();
        let cutoffTime = 0;

        switch (range) {
            case 'today':
                cutoffTime = now - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                cutoffTime = now - (60 * 24 * 60 * 60 * 1000);
                break;
            case '1y':
                cutoffTime = now - (365 * 24 * 60 * 60 * 1000);
                break;
            default:
                cutoffTime = 0; // Show all data
        }

        const result = [];

        // Read and filter files
        for (const file of files) {
            try {
                const filePath = path.join(historyDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const data = JSON.parse(content);

                // Check if has timestamp and GPU data
                if (data.last_updated_timestamp && data.gpu_nodes && data.gpu_nodes.length > 0) {
                    const timestamp = new Date(data.last_updated_timestamp).getTime();

                    // Include if within range
                    if (timestamp >= cutoffTime) {
                        result.push({
                            timestamp: data.last_updated_timestamp,
                            gpu_nodes: data.gpu_nodes,
                            login_nodes: data.login_nodes || [],
                            total_power_consumption_watts: data.total_power_consumption_watts || 0
                        });
                    }
                }
            } catch (err) {
                // Skip invalid files
                continue;
            }
        }

        // Sort by timestamp (oldest first)
        result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        console.log(`[benchmark-history] Range: ${range}, Returned: ${result.length} snapshots`);

        res.status(200).json({ data: result });

    } catch (error) {
        console.error('[benchmark-history] Error:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
}
