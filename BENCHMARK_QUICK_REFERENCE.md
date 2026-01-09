# Quick Reference: GPU Performance Benchmark

## Password
```
NeuroCore
```

## What Happens When You Start a Benchmark

### 1. **All Jobs Are Stopped** ✋
- **Real-time job termination** on ALL cluster nodes
- All Python/training processes are killed with `kill -9`
- No one can run anything while benchmark is active
- Ensures accurate, interference-free measurements

### 2. **GPU Detection** 🔍
- System queries each node using `nvidia-smi`
- Discovers all available GPUs automatically
- Gets real GPU names and indices

### 3. **Benchmarking Process** 🚀
For each GPU (sequentially):
- **Duration**: ~30-40 seconds per GPU
- **Stress Test**: PyTorch matrix multiplication (10000x10000 matrices)
- **Metrics Collected**:
  - GPU Utilization (%)
  - Memory Usage (GB)
  - Temperature (°C)
  - Power Consumption (W)
- **Sampling**: 10 samples taken every 2 seconds

### 4. **Results** 📊
- **Real-time updates** in the UI
- **Metrics displayed**:
  - Average utilization
  - Average memory usage
  - Average temperature
  - Average power consumption
  - Benchmark score (calculated)
- **Historical tracking**: Results saved to monthly files
- **Monthly comparison**: View performance trends over time

## How to Run a Benchmark

1. Navigate to **Benchmarks** page
2. Click **Performance Benchmark** tab
3. Click **Start Benchmark** button
4. Enter password: `NeuroCore`
5. Wait for completion (time = number of GPUs × 35 seconds)
6. View results in table and charts

## Important Notes

⚠️ **WARNING**: Starting a benchmark will:
- Kill ALL running jobs on ALL nodes
- Prevent anyone from running jobs during the benchmark
- Take several minutes to complete (depending on GPU count)

✅ **Benefits**:
- Get accurate, real performance data
- Track GPU degradation over time
- Identify underperforming GPUs
- Compare performance across months

## Data Storage

Results are stored in:
```
Dashboard/data/benchmark-history/YYYY-MM.json
```

Example: `2026-01.json` contains all benchmarks run in January 2026

## Troubleshooting

### Benchmark stuck?
- Check server logs for errors
- Ensure SSH connectivity to all nodes
- Verify PyTorch is installed on nodes

### No data showing?
- Wait for at least one GPU to complete
- Check browser console for errors
- Refresh the page

### Jobs not stopping?
- Verify SSH credentials in `SSH_CONFIG_TEMPLATE.env`
- Check node connectivity
- Look for permission errors in logs

## Technical Details

### Benchmark Score Formula
```
score = (utilization × 10) + (power × 2) + (100 - temperature)
```
Higher is better (high utilization, high power, low temp)

### GPU Stress Test
```python
# Runs on each GPU for 30 seconds
for i in range(100):
    x = torch.randn(10000, 10000, device='cuda')
    y = torch.randn(10000, 10000, device='cuda')
    z = torch.matmul(x, y)
    torch.cuda.synchronize()
```

### Metrics Collection
```bash
nvidia-smi --query-gpu=index,utilization.gpu,memory.used,temperature.gpu,power.draw \
  --format=csv,noheader,nounits
```

## Files Modified

1. `Dashboard/pages/api/performance-benchmark/start.ts`
   - Password: 'NeuroCore'
   - Job stopping logic
   - GPU detection

2. `Dashboard/pages/api/performance-benchmark/status.ts`
   - Real GPU benchmarking
   - Metrics collection
   - Result storage

3. `Dashboard/pages/api/performance-benchmark/monthly.ts`
   - Historical data storage
   - Monthly file management
