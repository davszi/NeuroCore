// Quick test to verify API response
const testUrl = 'http://localhost:3000/api/benchmark-history?range=month';

fetch(testUrl)
    .then(res => res.json())
    .then(data => {
        console.log('API Response:', {
            dataCount: data.data?.length || 0,
            firstItem: data.data?.[0],
            hasGpuNodes: data.data?.[0]?.gpu_nodes?.length > 0
        });
    })
    .catch(err => console.error('API Error:', err));
