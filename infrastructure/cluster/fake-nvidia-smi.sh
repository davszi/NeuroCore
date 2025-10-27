#!/usr/bin/env bash
set -euo pipefail
# Fake NVIDIA SMI for simulation nodes
# Supports:
#   --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw
#   --format=csv,noheader,nounits

: "${FAKE_GPU_COUNT:=1}"
: "${FAKE_SEED:=42}"

# Generate deterministic pseudo-random values per 5-second bucket
BUCKET=$(( $(date +%s) / 5 ))
HOSTHASH=$(echo -n "$(hostname)" | md5sum | cut -c1-8)
SALT=$(( 0x${HOSTHASH} ))

rand() { # $1=min $2=max $3=offset
  local min=$1 max=$2 off=$3
  local val=$(( ( (FAKE_SEED + SALT + BUCKET + off) * 1103515245 + 12345 ) & 0x7fffffff ))
  echo $(( min + (val % (max - min + 1)) ))
}

for i in $(seq 0 $((FAKE_GPU_COUNT-1))); do
  util=$(rand 5 95 $i)

  memtot=$(rand 4096 24576 $((i+100)))
  memtot=$(( (memtot / 256) * 256 ))   # round to 256MiB

  jitter=$(rand 0 20 $((i+200)))
  memuse=$(( (util * memtot) / (100 + jitter) ))

  temp=$(rand 35 80 $((i+300)))
  power=$(rand 50 250 $((i+400)))
  echo "${util}, ${memuse}, ${memtot}, ${temp}, ${power}"
done
