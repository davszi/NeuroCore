#!/usr/bin/env python3
import subprocess, json, sys, yaml, os, re

# --- Config Paths (from environment variables) ---
NODES_CONFIG_PATH = os.environ.get('CONFIG_NODES_PATH', '/config/nodes.yaml')
GPU_CONFIG_PATH = os.environ.get('CONFIG_GPU_INVENTORY_PATH', '/config/gpu_inventory.yaml')
OUTPUT_FILE = "/neurocore/data/metrics.jsonl"
SSH_PASS = "cluster"

# --- Command to get CPU and RAM stats ---
# 1. Gets CPU usage % (calculates 100 - idle %)
# 2. Gets RAM used (MB) and RAM total (MB)
HOST_STATS_CMD = "top -bn1 | grep '%Cpu(s)' | awk '{print 100 - $8}'; free -m | grep Mem | awk '{print $3, $2}'"

# --- Helper Functions ---
def load_config(path):
    """Loads a YAML config file safely."""
    try:
        with open(path, 'r') as f:
            return yaml.safe_load(f)
    except Exception as e:
        print(f"❌ Error loading config {path}: {e}", file=sys.stderr)
        return {}

def parse_host_stats(output: str) -> dict:
    """Parses the output of the HOST_STATS_CMD."""
    try:
        lines = output.strip().split('\n')
        if len(lines) < 2:
            print(f"⚠️ Failed to parse host stats: unexpected output '{output}'", file=sys.stderr)
            return {}
            
        cpu_util = float(lines[0].strip())
        ram_parts = lines[1].strip().split()
        ram_used_mb = float(ram_parts[0])
        ram_total_mb = float(ram_parts[1])
        
        return {
            "cpu_util_percent": round(cpu_util, 1),
            "mem_util_percent": round((ram_used_mb / ram_total_mb) * 100, 1),
            "mem_total_gb": round(ram_total_mb / 1024, 1)
        }
    except Exception as e:
        print(f"❌ Error parsing host stats '{output}': {e}", file=sys.stderr)
        return {}

# --- Main Script ---
records = []
nodes_config = load_config(NODES_CONFIG_PATH)
gpu_config = load_config(GPU_CONFIG_PATH)
nodes_to_poll = nodes_config.get('nodes', [])

if not nodes_to_poll:
    print("❌ No nodes found in config file. Exiting.", file=sys.stderr)
    sys.exit(1)

# --- Loop over all nodes from nodes.yaml ---
for node in nodes_to_poll:
    node_name = node.get("name")
    if not node_name:
        continue
        
    try:
        node_port = node["port"]
        node_user = node["user"]
        
        ssh_cmd_base = [
            "sshpass", "-p", SSH_PASS,
            "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-p", "22", # ℹ️ Connect to internal port 22
            f"{node_user}@{node_name}",
        ]
        
        # --- 1. Get GPU Stats (CSV) ---
        gpu_cmd = ssh_cmd_base + ["/opt/neurocore/fake-nvidia-smi.sh"]
        gpu_result = subprocess.run(gpu_cmd, capture_output=True, text=True, timeout=10)
        
        if gpu_result.returncode != 0:
            print(f"Error polling GPU metrics from {node_name}: {gpu_result.stderr}", file=sys.stderr)
            continue

        # --- 2. Get Host Stats (CPU/MEM) ---
        host_cmd = ssh_cmd_base + [HOST_STATS_CMD]
        host_result = subprocess.run(host_cmd, capture_output=True, text=True, timeout=10)
        
        if host_result.returncode != 0:
            print(f"Error polling host stats from {node_name}: {host_result.stderr}", file=sys.stderr)
            continue
            
        # --- 3. Parse and Combine Data ---
        
        # Get static data from inventory files
        static_node_data = gpu_config.get('nodes', {}).get(node_name, {})
        default_gpu_data = gpu_config.get('defaults', {})

        # Get dynamic data from script outputs
        host_stats = parse_host_stats(host_result.stdout)
        gpu_csv_lines = gpu_result.stdout.strip().split('\n')
        
        # Build the final GpuNode object
        node_metrics = {
            "node_name": node_name,
            "cores_total": static_node_data.get('cores_total', default_gpu_data.get('cores_total')),
            "mem_total_gb": host_stats.get('mem_total_gb'), # Get from 'free' command
            "cpu_util_percent": host_stats.get('cpu_util_percent'), # Get from 'top' command
            "mem_util_percent": host_stats.get('mem_util_percent'), # Get from 'free' command
            "gpu_summary_name": static_node_data.get('gpu_name', default_gpu_data.get('gpu_name')),
            "gpus": []
        }

        # Loop through each GPU in the CSV output
        for i, line in enumerate(gpu_csv_lines):
            if not line:
                continue
            try:
                parts = [p.strip() for p in line.split(',')]
                # CSV format: util, memuse, memtot, temp, power
                gpu_data = {
                    "gpu_id": i,
                    "gpu_name": static_node_data.get('gpu_name', default_gpu_data.get('gpu_name')),
                    "utilization_percent": float(parts[0]),
                    "memory_used_mib": float(parts[1]),
                    "memory_total_mib": float(parts[2]),
                    "temperature_celsius": float(parts[3]),
                    "power_draw_watts": float(parts[4]), # This name matches GpuCard.tsx
                    "power_limit_watts": static_node_data.get('power_limit_watts', default_gpu_data.get('power_limit_watts'))
                }
                node_metrics["gpus"].append(gpu_data)
            except Exception as e:
                print(f"❌ Failed to parse GPU line: '{line}'. Error: {e}", file=sys.stderr)
        
        records.append(node_metrics)

    except Exception as e:
        print(f"❌ Failed to process metrics for {node_name}: {e}", file=sys.stderr)

# --- 4. Write Final File ---
try:
    with open(OUTPUT_FILE, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"✅ Successfully wrote metrics for {len(records)} nodes to {OUTPUT_FILE}")
except Exception as e:
    print(f"❌ Error writing to {OUTPUT_FILE}: {e}", file=sys.stderr)