#!/usr/bin/env python3
import subprocess, json, sys, yaml, os

# --- NEW: Read Config Files ---
NODES_CONFIG_PATH = os.environ.get('CONFIG_NODES_PATH', '/config/nodes.yaml')
# ℹ️ We no longer need the GPU_CONFIG_PATH
OUTPUT_FILE = "/neurocore/data/metrics.jsonl"
SSH_PASS = "cluster"

def load_nodes():
    try:
        with open(NODES_CONFIG_PATH, 'r') as f:
            config_data = yaml.safe_load(f)
            return config_data.get('nodes', [])
    except Exception as e:
        print(f"❌ Error loading config {NODES_CONFIG_PATH}: {e}", file=sys.stderr)
        return []

# --- Main Script ---
records = []
nodes_to_poll = load_nodes()

if not nodes_to_poll:
    print("❌ No nodes found in config file. Exiting.", file=sys.stderr)
    sys.exit(1)

for node in nodes_to_poll:
    node_name = node.get("name")
    if not node_name:
        continue
        
    try:
        node_port = node["port"]
        node_user = node["user"]
        
        ssh_cmd = [
            "sshpass", "-p", SSH_PASS,
            "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-p", "22", # ℹ️ Connect to internal port 22
            f"{node_user}@{node_name}",
            "/opt/neurocore/fake-nvidia-smi.sh" # Run the fake-smi script
        ]
        
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            print(f"Error polling metrics from {node_name}: {result.stderr}", file=sys.stderr)
            continue
        
        # The script outputs one complete JSON object per node
        node_metrics = json.loads(result.stdout)
        
        # ℹ️ (Optional) We can still merge static data if we want
        #     but the core data is all there now.
        
        records.append(node_metrics)

    except Exception as e:
        print(f"Failed to process metrics for {node_name}: {e}", file=sys.stderr)

# ✍️ Write output file
try:
    with open(OUTPUT_FILE, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"✅ Successfully wrote metrics for {len(records)} nodes to {OUTPUT_FILE}")
except Exception as e:
    print(f"❌ Error writing to {OUTPUT_FILE}: {e}", file=sys.stderr)