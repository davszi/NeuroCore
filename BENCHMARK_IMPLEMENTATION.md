# Performance Benchmark Implementation Summary

## Changes Made

### 1. Password Changed to 'NeuroCore'
- Updated `Dashboard/pages/api/performance-benchmark/start.ts` to use password 'NeuroCore'
- Password is verified before any benchmark operations begin

### 2. Real Job Stopping
When a benchmark starts, the system now:
- Connects to ALL cluster nodes via SSH
- Identifies all running Python/training processes
- Kills all processes using `kill -9` to ensure complete termination
- Logs all stopped processes for verification

**Implementation**: `Dashboard/pages/api/performance-benchmark/start.ts` (lines 32-67)

### 3. Real GPU Detection
- Uses `nvidia-smi` to query actual GPUs on each node
- Collects real GPU names and indices
- Falls back to config-based detection if SSH fails

**Implementation**: `Dashboard/pages/api/performance-benchmark/start.ts` (lines 70-122)

### 4. Real GPU Benchmarking
Each GPU is benchmarked using:
- **Stress Test**: 30-second PyTorch matrix multiplication workload
- **Metrics Collection**: 10 samples taken every 2 seconds during the test
- **Real Data Collected**:
  - GPU Utilization (%)
  - Memory Usage (MiB)
  - Temperature (°C)
  - Power Consumption (W)
  - Benchmark Score (calculated from metrics)

**Implementation**: `Dashboard/pages/api/performance-benchmark/status.ts` (lines 14-138)

### 5. Historical Data Tracking
- Benchmark results are automatically saved to monthly JSON files
- Files stored in `data/benchmark-history/YYYY-MM.json`
- Enables tracking of GPU performance degradation over time
- Monthly comparison charts display real historical data

**Implementation**: 
- `Dashboard/pages/api/performance-benchmark/monthly.ts` (save function)
- `Dashboard/pages/api/performance-benchmark/status.ts` (auto-save on completion)

## How It Works

### Starting a Benchmark
1. User clicks "Start Benchmark" button
2. Modal prompts for password ('NeuroCore')
3. API stops ALL running jobs on ALL nodes
4. API queries all GPUs using nvidia-smi
5. Benchmark ID is created and returned immediately
6. Background process starts benchmarking each GPU sequentially

### During Benchmark
1. For each GPU:
   - Launches PyTorch stress test (30 seconds)
   - Collects metrics every 2 seconds (10 samples)
   - Calculates average metrics
   - Stores results in memory
2. Frontend polls status endpoint every 2 seconds
3. UI updates in real-time showing:
   - Current GPU being tested
   - Completed/Running/Failed counts
   - Real metrics for completed GPUs

### After Benchmark
1. All results saved to monthly JSON file
2. Results displayed in table with real metrics
3. Monthly comparison chart shows historical trends
4. Data persists across server restarts

## Files Modified

1. `Dashboard/pages/api/performance-benchmark/start.ts` - Job stopping, GPU detection, benchmark initialization
2. `Dashboard/pages/api/performance-benchmark/status.ts` - Real GPU benchmarking, metrics collection
3. `Dashboard/pages/api/performance-benchmark/monthly.ts` - Historical data storage and retrieval

## Testing

To test the implementation:

1. Navigate to `/benchmarks` page
2. Click "Performance Benchmark" tab
3. Click "Start Benchmark" button
4. Enter password: `NeuroCore`
5. Watch real-time progress as GPUs are benchmarked
6. View real metrics in the results table
7. Check monthly comparison chart for historical data

## Technical Details

### GPU Stress Test Command
```bash
CUDA_VISIBLE_DEVICES=<gpu_index> timeout 30s python3 -c "
import torch
import time

device = torch.device('cuda:0')
print('Starting GPU stress test...')

for i in range(100):
    x = torch.randn(10000, 10000, device=device)
    y = torch.randn(10000, 10000, device=device)
    z = torch.matmul(x, y)
    torch.cuda.synchronize()
    time.sleep(0.1)

print('GPU stress test completed')
"
```

### Metrics Collection Command
```bash
nvidia-smi --query-gpu=index,utilization.gpu,memory.used,temperature.gpu,power.draw \
  --format=csv,noheader,nounits | grep "^<gpu_index>,"
```

### Benchmark Score Calculation
```
score = (utilization_avg * 10) + (power_consumption_avg * 2) + (100 - temperature_avg)
```
Higher scores indicate better performance (higher utilization, higher power draw, lower temperature).

## Data Storage

Benchmark results are stored in:
```
Dashboard/data/benchmark-history/
  ├── 2026-01.json
  ├── 2026-02.json
  └── ...
```

Each file contains an array of benchmark results for that month.

## Notes

- Benchmarks run sequentially (one GPU at a time) to avoid resource contention
- Each GPU benchmark takes approximately 30-40 seconds
- Total benchmark time = (number of GPUs) × 35 seconds (average)
- Results are saved automatically when all GPUs complete
- Failed benchmarks are logged but don't stop the overall process
