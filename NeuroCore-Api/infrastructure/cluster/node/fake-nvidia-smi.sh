#!/usr/bin/env bash
set -eo pipefail # Keep error checking, but remove -u which caused issues

# Fake NVIDIA SMI for simulation nodes
# Supports:
#   --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw
#   --format=csv,noheader,nounits

# Explicitly read environment variables, providing defaults if unset/empty
declare -i FAKE_GPU_COUNT
declare -i FAKE_SEED
FAKE_GPU_COUNT=${FAKE_GPU_COUNT:-1} 
FAKE_SEED=${FAKE_SEED:-42}

# Generate deterministic pseudo-random values per 5-second bucket
BUCKET=$(( $(date +%s) / 5 ))
HOSTHASH=$(echo -n "$(hostname)" | md5sum | cut -c1-8)
SALT=$(( 0x${HOSTHASH} )) # Convert hex hash prefix to integer for salt

# Simple pseudo-random generator based on seed, time bucket, hostname, and offset
rand() { # $1=min $2=max $3=offset
  local min=$1 max=$2 off=$3
  # Use a simple linear congruential generator (LCG) approach for pseudo-randomness
  # Combine seeds, salt, time bucket, and offset for deterministic variation
  local val=$(( ( (FAKE_SEED + SALT + BUCKET + off) * 1103515245 + 12345 ) & 0x7fffffff ))
  # Scale the value to the desired range [min, max]
  echo $(( min + (val % (max - min + 1)) ))
}


# Loop through the number of GPUs specified by FAKE_GPU_COUNT
for i in $(seq 0 $((FAKE_GPU_COUNT-1))); do
  # Generate random values within specified bounds using the rand function and GPU index as offset
  util=$(rand 5 95 $i)

  # Set static memory.total based on node hostname
  case "$(hostname)" in
    node1) memtot=16384 ;;  # 16 GB
    node2) memtot=12288 ;;  # 12 GB
    node3) memtot=8192 ;;   # 8 GB
    *) memtot=16384 ;;      # default fallback
  esac

  memtot=$(( (memtot / 256) * 256 ))

  # Call rand first to get the random offset for memory usage calculation
  memuse_rand_offset=$(rand 0 20 $((i+200)))
  # Calculate memory used based on utilization and total memory, with a random variation
  denominator=$((100 + memuse_rand_offset)) # Denominator will be between 100 and 120
  memuse=$(( (util * memtot) / denominator )) # Calculate memory used

  # Generate random temperature and power draw
  temp=$(rand 35 80 $((i+300)))
  power=$(rand 50 250 $((i+400)))

  # Output the metrics as a CSV row
  echo "${util}, ${memuse}, ${memtot}, ${temp}, ${power}"
done

exit 0