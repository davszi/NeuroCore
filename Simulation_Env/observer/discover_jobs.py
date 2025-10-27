#!/usr/bin/env python3
import subprocess, json, sys, os

NODES = [
    {"name": "node1", "port": "22"},
    {"name": "node2", "port": "22"},
]
OUTPUT_FILE = "/data_out/jobs.jsonl"
SSH_USER = "cluster"
SSH_PASS = "cluster"

# --- FIX: Point to the exact same shared socket path ---
TMUX_SOCKET = "/data_out/tmux.socket"

records = []
for node in NODES:
    node_name = node["name"]
    try:
        ssh_cmd_base = [
            "sshpass", "-p", SSH_PASS,
            "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
            "-p", node["port"],
            f"{SSH_USER}@{node_name}",
        ]
        
        # --- FIX: Use the shared socket in all tmux commands ---
        tmux_base_cmd = f"tmux -S {TMUX_SOCKET}"

        # 1. List tmux sessions
        tmux_cmd = ssh_cmd_base + [f"{tmux_base_cmd} ls -F '#{{session_name}}' 2>/dev/null || true"]
        result = subprocess.run(tmux_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            print(f"Error connecting to {node_name}: {result.stderr}", file=sys.stderr)
            continue

        for line in result.stdout.splitlines():
            if line.startswith("train:"):
                session_name = line.strip()
                
                # 2. Get PID
                pid_cmd = ssh_cmd_base + [f"{tmux_base_cmd} display-message -p -t {session_name} '#{{pane_pid}}'"]
                pid_result = subprocess.run(pid_cmd, capture_output=True, text=True, timeout=5)
                
                if not pid_result.stdout.strip().isdigit():
                    print(f"Warning: Could not get PID for {session_name} on {node_name}. Session might be starting.", file=sys.stderr)
                    continue
                pid = int(pid_result.stdout.strip())
                
                # 3. Get Uptime
                uptime_cmd = ssh_cmd_base + [f"ps -p {pid} -o etime="]
                uptime_result = subprocess.run(uptime_cmd, capture_output=True, text=True, timeout=5)
                uptime = uptime_result.stdout.strip()

                # 4. Get Log Preview
                log_file = f"/data_out/logs/{session_name.replace(':','_')}.log"
                log_cmd = ssh_cmd_base + [f"tail -n 5 {log_file} 2>/dev/null || true"]
                log_result = subprocess.run(log_cmd, capture_output=True, text=True, timeout=5)

                records.append({
                    "node": node_name,
                    "session": session_name,
                    "pid": pid,
                    "uptime": uptime,
                    "log_preview": log_result.stdout.splitlines()
                })

    except Exception as e:
        print(f"Failed to process {node_name}: {e}", file=sys.stderr)

try:
    with open(OUTPUT_FILE, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"Successfully wrote {len(records)} jobs to {OUTPUT_FILE}")
except Exception as e:
    print(f"Error writing to {OUTPUT_FILE}: {e}", file=sys.stderr)