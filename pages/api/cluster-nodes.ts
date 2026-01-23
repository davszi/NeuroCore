import { NextApiRequest, NextApiResponse } from 'next';
import { CLUSTER_NODES } from '@/lib/config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(200).json({
        nodes: CLUSTER_NODES.filter(node => node.hasGpu).map(node => ({
            name: node.name,
            hasGpu: node.hasGpu
        }))
    });
}
