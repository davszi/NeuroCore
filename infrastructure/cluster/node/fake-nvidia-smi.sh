#!/usr/bin/env bash
set -eo pipefail 

# ℹ️ Read environment variables for GPU count and seed
declare -i FAKE_GPU_COUNT
declare -i FAKE_SEED
FAKE_GPU_COUNT=${FAKE_GPU_COUNT:-1}
FAKE_SEED=${FAKE_SEED:-42}

# ℹ️ Generate deterministic "random" values based on time, hostname, etc.
BUCKET=$(( $(date +%s) / 5 ))
HOSTHASH=$(echo -n "$(hostname)" | md5sum | cut -c1-8)
SALT=$(( 0x${HOSTHASH} )) 

rand() { 
  local min=$1 max=$2 off=$3
  local val=$(( ( (FAKE_SEED + SALT + BUCKET + off) * 1103515245 + 12345 ) & 0x7fffffff ))
  echo $(( min + (val % (max - min + 1)) ))
}

CPU_UTIL=$(rand 5 25 1000)
MEM_UTIL=$(rand 10 30 2000)

GPU_JSON_ARRAY="" # Start with an empty string
for i in $(seq 0 $((FAKE_GPU_COUNT-1))); do
  util=$(rand 5 95 $i)
  memtot_rand_val=$(rand 4096 24576 $((i+100)))
  memtot=$(( (memtot_rand_val / 256) * 256 ))
  memuse_rand_offset=$(rand 0 20 $((i+200)))
  memuse=$(( (util * memtot) / (100 + memuse_rand_offset) ))
  temp=$(rand 35 80 $((i+300)))
  power=$(rand 50 250 $((i+400)))

  # ℹ️ Create a JSON object for this GPU
  GPU_JSON="{\"gpu_id\": $i, \"utilization_percent\": $util, \"memory_used_mib\": $memuse, \"memory_total_mib\": $memtot, \"temperature_celsius\": $temp, \"power_draw_watts\": $power}"

  # ℹ️ Add it to the array string (with a comma if not the first)
  if [ -z "$GPU_JSON_ARRAY" ]; then
    GPU_JSON_ARRAY="$GPU_JSON"
  else
    GPU_JSON_ARRAY="$GPU_JSON_ARRAY, $GPU_JSON"
  fi
done

cat << EOF
{
  "node_name": "$(hostname)",
  "cpu_util_percent": $CPU_UTIL,
  "mem_util_percent": $MEM_UTIL,
  "gpus": [$GPU_JSON_ARRAY]
}
EOF

exit 0