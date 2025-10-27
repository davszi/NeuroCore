#!/bin/bash

# This script simulates nvidia-smi and outputs JSON data

# Create deterministic "random" values based on the time
# This makes the values change but be plausible
GPU_UTIL=$(($(date +%s) % 70 + 30)) # 30-100%
MEM_UTIL=$(($(date +%s) % 50 + 40)) # 40-90%
TEMP=$(($(date +%s) % 20 + 65))     # 65-85C
POWER=$(($(date +%s) % 100 + 250))  # 250-350W

cat << EOF
{
  "node_name": "$HOSTNAME",
  "cores_total": 64,
  "mem_total_gb": 512,
  "cpu_util_percent": $(($(date +%s) % 15 + 5)),
  "mem_util_percent": $(($(date +%s) % 30 + 20)),
  "gpu_summary_name": "4x H200 (Sim)",
  "gpus": [
    {
      "gpu_id": 0,
      "gpu_name": "NVIDIA H200 (Sim)",
      "utilization_percent": $GPU_UTIL,
      "memory_util_percent": $MEM_UTIL,
      "memory_used_mib": 81920,
      "memory_total_mib": 92160,
      "temperature_celsius": $TEMP,
      "power_watts": $POWER,
      "power_limit_watts": 400
    },
    {
      "gpu_id": 1,
      "gpu_name": "NVIDIA H200 (Sim)",
      "utilization_percent": $(($(date +%s) % 10)),
      "memory_util_percent": 10,
      "memory_used_mib": 9216,
      "memory_total_mib": 92160,
      "temperature_celsius": 35,
      "power_watts": 50,
      "power_limit_watts": 400
    }
  ]
}
EOF