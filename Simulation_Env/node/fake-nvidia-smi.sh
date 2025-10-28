#!/bin/bash

# This script simulates nvidia-smi and outputs JSON data

# --- NEW: Add a small offset based on hostname ---
# Hash the hostname to get a node-specific number
NODE_OFFSET=$(echo "$HOSTNAME" | md5sum | tr -d ' -' | head -c 4)
# Convert hex to decimal and scale it (0-15)
NODE_OFFSET=$(( (16#$NODE_OFFSET / 100) % 16 ))
# --- END NEW ---


# Create deterministic "random" values based on the time + offset
CURRENT_TIME=$(date +%s)
GPU_UTIL=$(( (CURRENT_TIME + NODE_OFFSET * 2) % 70 + 30 )) # 30-100%
MEM_UTIL=$(( (CURRENT_TIME + NODE_OFFSET * 3) % 50 + 40 )) # 40-90%
TEMP=$(( (CURRENT_TIME + NODE_OFFSET) % 20 + 65 ))     # 65-85C
POWER=$(( (CURRENT_TIME + NODE_OFFSET * 5) % 100 + 250 ))  # 250-350W
CPU_UTIL=$(( (CURRENT_TIME + NODE_OFFSET) % 15 + 5 ))
MEM_UTIL_SYS=$(( (CURRENT_TIME + NODE_OFFSET * 2) % 30 + 20 ))


cat << EOF
{
  "node_name": "$HOSTNAME",
  "cores_total": 64,
  "mem_total_gb": 512,
  "cpu_util_percent": $CPU_UTIL,
  "mem_util_percent": $MEM_UTIL_SYS,
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
      "utilization_percent": $(((CURRENT_TIME + NODE_OFFSET) % 10)),
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