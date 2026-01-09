import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

interface ComparisonResult {
    timestamp: string;
    runId: string;
    node: string;
    gpuId: number;
    gpuName: string;
    results: {
        with_jobs: {
            duration: number;
            avgUtilization?: number;
            avgTemp?: number;
        };
        without_jobs: {
            duration: number;
            avgUtilization?: number;
            avgTemp?: number;
        };
    };
    performanceImpact: number;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        // Save comparison result
        try {
            const comparisonData: ComparisonResult = req.body;

            const historyDir = path.join(process.cwd(), 'data/comparison-history');
            if (!fs.existsSync(historyDir)) {
                fs.mkdirSync(historyDir, { recursive: true });
            }

            const fileName = `comparison-${comparisonData.runId}.json`;
            const filePath = path.join(historyDir, fileName);

            fs.writeFileSync(filePath, JSON.stringify(comparisonData, null, 2));

            console.log(`[Comparison] Saved: ${fileName}`);
            res.status(200).json({ success: true, fileName });

        } catch (error) {
            console.error('Error saving comparison:', error);
            res.status(500).json({ error: 'Failed to save comparison data' });
        }

    } else if (req.method === 'GET') {
        // Retrieve comparison history
        try {
            const { range = '7d' } = req.query;

            const historyDir = path.join(process.cwd(), 'data/comparison-history');

            if (!fs.existsSync(historyDir)) {
                return res.status(200).json({ data: [] });
            }

            const files = fs.readdirSync(historyDir)
                .filter(f => f.startsWith('comparison-') && f.endsWith('.json'))
                .sort()
                .reverse();

            // Determine time range
            const now = Date.now();
            let cutoffTime = now;

            switch (range) {
                case 'today':
                    cutoffTime = now - (24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
                    break;
                case '1y':
                    cutoffTime = now - (365 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
            }

            const comparisons: ComparisonResult[] = [];

            for (const file of files) {
                try {
                    const filePath = path.join(historyDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const data: ComparisonResult = JSON.parse(content);

                    const dataTime = new Date(data.timestamp).getTime();
                    if (dataTime >= cutoffTime) {
                        comparisons.push(data);
                    }
                } catch (err) {
                    console.error(`Error reading ${file}:`, err);
                }
            }

            // Sort by timestamp (oldest first for charting)
            comparisons.sort((a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            res.status(200).json({ data: comparisons });

        } catch (error) {
            console.error('Error fetching comparison history:', error);
            res.status(500).json({ error: 'Failed to fetch comparison history' });
        }

    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}
