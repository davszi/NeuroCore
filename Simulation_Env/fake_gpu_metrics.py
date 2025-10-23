#!/usr/bin/env python3

"""
S1-US2: Fake GPU Metrics (nvidia-smi Shim)

Generates plausible, randomized GPU metrics.
Can be run standalone for testing or imported as a module.
"""

import random
import json
import argparse
import sys
from datetime import datetime

# --- Constants ---
# Based on MONICA screenshots and team discussion
GPU_MODELS = ["NVIDIA H100", "NVIDIA A100", "NVIDIA RTX 6000"]
POWER_LIMITS = {"NVIDIA H100": 350, "NVIDIA A100": 300, "NVIDIA RTX 6000": 300}
MEMORY_TOTALS = {"NVIDIA H100": 81920, "NVIDIA A100": 40960, "NVIDIA RTX 6000": 47952}


def generate_fake_gpu_data(num_gpus, node_name):
    """
    Generates a list of fake GPU data dicts for a node.
    This is the main importable function.
    """
    gpus_list = []

    # Use a simple hash of the node name for determinism.
    # This ensures a node (e.g., dws-09) always has the same GPU model.
    model_index = hash(node_name) % len(GPU_MODELS)
    gpu_model_name = GPU_MODELS[model_index]

    memory_total = MEMORY_TOTALS[gpu_model_name]
    power_limit = POWER_LIMITS[gpu_model_name]

    for i in range(num_gpus):
        utilization = random.randint(0, 100)

        # Make metrics look a bit more realistic
        if utilization > 10:
            memory_used = random.randint(1024, memory_total)
            temperature = random.randint(50, 90)
            power = random.randint(100, power_limit)
        else:
            # Idle state
            memory_used = random.randint(0, 1024)
            temperature = random.randint(30, 49)
            power = random.randint(30, 99)

        memory_util_percent = int((memory_used / memory_total) * 100)

        gpu_data = {
            "gpu_id": i,
            "gpu_name": gpu_model_name,
            "utilization_percent": utilization,
            "memory_util_percent": memory_util_percent,
            "memory_used_mib": memory_used,
            "memory_total_mib": memory_total,
            "temperature_celsius": temperature,
            "power_watts": power,
            "power_limit_watts": power_limit
        }
        gpus_list.append(gpu_data)

    return gpus_list


def main():
    """
    Main entry point for standalone script.
    Provides a CLI for testing the generator.
    """
    parser = argparse.ArgumentParser(
        description="S1-US2: Fake NVIDIA-SMI Shim"
    )

    parser.add_argument(
        "-n", "--num-gpus",
        type=int,
        default=random.randint(2, 4),
        help="Number of GPUs to simulate"
    )

    parser.add_argument(
        "--node-name",
        type=str,
        default="sim-node-01",
        help="Node name to seed the generator"
    )

    parser.add_argument(
        "--format",
        choices=['json', 'human'],
        default='json',
        help="Output format (default: json)"
    )

    # Fulfills AC3: "Invalid flags cause non-zero exit"
    try:
        args = parser.parse_args()
    except argparse.ArgumentError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)  # Non-zero exit

    # --- Generate and Print Data ---
    gpu_data = generate_fake_gpu_data(args.num_gpus, args.node_name)

    # Simple wrapper for testing standalone
    output = {
        "timestamp": int(datetime.now().timestamp()),
        "node_name": args.node_name,
        "gpus": gpu_data
    }

    if args.format == 'json':
        print(json.dumps(output, indent=2))
    else:
        # Simple human-readable output
        print(f"--- FAKE-NVIDIA-SMI on {args.node_name} ---")
        for gpu in output['gpus']:
            print(
                f"  Util: {gpu['utilization_percent']}% | Mem: {gpu['memory_used_mib']} / {gpu['memory_total_mib']} MiB")


if __name__ == "__main__":
    # Only run main() if executed as a script
    main()