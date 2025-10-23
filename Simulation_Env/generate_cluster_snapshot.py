#!/usr/bin/env python3

"""
Workstream A: Cluster Simulation Snapshot Generator

Generates the main JSON snapshot for the Team B Observer UI.
This version is focused on 'login_nodes' and 'gpu_nodes'
(omitting Storage/SLURM for now based on team feedback).

It imports live GPU data from the fake_gpu_metrics module.
"""

import json
import random
import time
from datetime import datetime

# This is the "extract" step - import the S1-US2 module
try:
    from fake_gpu_metrics import generate_fake_gpu_data
except ImportError:
    print("Error: Could not find 'fake_gpu_metrics.py'.")
    print("Please make sure it is in the same directory.")
    exit(1)


def get_mock_login_nodes():
    """Generates mock data for Login Nodes (based on MONICA)."""
    return [
        {
            "node_name": "dws-login-01",
            "cores_total": 32, "mem_total_gb": 110,
            "cpu_util_percent": random.randint(10, 30),
            "mem_util_percent": random.randint(20, 40),
            "active_users": random.randint(20, 30)
        },
        {
            "node_name": "dws-login-02",
            "cores_total": 32, "mem_total_gb": 110,
            "cpu_util_percent": random.randint(0, 5),
            "mem_util_percent": random.randint(15, 25),
            "active_users": random.randint(5, 15)
        }
    ]


def get_live_gpu_nodes():
    """
    Generates the 'gpu_nodes' list by calling the metrics module
    for each simulated node.
    """

    # Define our simulated GPU nodes (specs from MONICA)
    node_definitions = [
        {"name": "dws-09", "cores": 40, "mem_gb": 768, "num_gpus": 2},
        {"name": "dws-12", "cores": 192, "mem_gb": 1536, "num_gpus": 4},
        {"name": "dws-15", "cores": 96, "mem_gb": 1024, "num_gpus": 8}
    ]

    gpu_nodes_list = []

    for node_def in node_definitions:
        # --- Import live GPU data ---
        live_gpu_list = generate_fake_gpu_data(node_def["num_gpus"], node_def["name"])

        # Get the first GPU's name to create the "summary" (e.g., "4x NVIDIA H100")
        summary_name = f"{node_def['num_gpus']}x {live_gpu_list[0]['gpu_name']}"

        node_data = {
            "node_name": node_def["name"],
            "cores_total": node_def["cores"],
            "mem_total_gb": node_def["mem_gb"],
            "cpu_util_percent": random.randint(1, 10),
            "mem_util_percent": random.randint(1, 55),
            "gpu_summary_name": summary_name,
            "gpus": live_gpu_list  # Inject the live data here
        }
        gpu_nodes_list.append(node_data)

    return gpu_nodes_list


def main():
    """
    Main entry point. Assembles all mock data parts
    and prints the final, combined JSON for Team B.
    """

    # 1. Assemble all the pieces
    cluster_data = {
        "last_updated_timestamp": datetime.now().isoformat() + "Z",
        "total_power_consumption_watts": random.randint(9000, 12000),
        "login_nodes": get_mock_login_nodes(),
        # Storage and SLURM info removed per team feedback (10/20)
        "gpu_nodes": get_live_gpu_nodes()  # This part is LIVE
    }

    # 2. Print the final JSON to stdout
    print(json.dumps(cluster_data, indent=2))


if __name__ == "__main__":
    main()