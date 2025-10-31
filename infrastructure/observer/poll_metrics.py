#!/usr/bin/env python3
import subprocess, json, sys, os

NODES = [
    {"name": "node1", "port": "22"},
    {"name": "node2", "port": "22"},
]
OUTPUT_FILE = "/data_out/metrics.jsonl"
SSH_USER = "cluster"
SSH_PASS = "cluster"

records = []
for node in NODES:
    node_name = node["name"]
    try:
        ssh_cmd = [
            "sshpass", "-p", SSH_PASS,
            "ssh", "-o", "StrictHostKeyChecking=no",
            "-p", node["port"],
            f"{SSH_USER}@{node_name}",
            "/opt/neurocore/fake-nvidia-smi.sh" # Run the fake-smi script
        ]
        
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            print(f"Error polling metrics from {node_name}: {result.stderr}", file=sys.stderr)
            continue
        
        # The script outputs JSON, so we just parse it
        node_metrics = json.loads(result.stdout)
        records.append(node_metrics)

    except Exception as e:
        print(f"Failed to process metrics for {node_name}: {e}", file=sys.stderr)

# Write as JSON Lines
try:
    with open(OUTPUT_FILE, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"Successfully wrote metrics for {len(records)} nodes to {OUTPUT_FILE}")
except Exception as e:
    print(f"Error writing to {OUTPUT_FILE}: {e}", file=sys.stderr)