#!/usr/bin/env python3
import subprocess, json, sys, os, re # <-- Import re for regex

NODES = [
    {"name": "node1", "port": "22"},
    {"name": "node2", "port": "22"},
]
OUTPUT_FILE = "/data_out/jobs.jsonl"
SSH_USER = "cluster"
SSH_PASS = "cluster"

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
        
        # Find all 'dummy_train.py' processes for this user
        search_cmd = "pgrep -af 'python3 -u /opt/neurocore/dummy_train.py'"
        
        find_cmd = ssh_cmd_base + [search_cmd]
        result = subprocess.run(find_cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 1:
            print(f"No processes found on {node_name}.")
            continue
        elif result.returncode != 0:
            print(f"Error finding processes on {node_name}: {result.stderr}", file=sys.stderr)
            continue
            
        # Process the output of pgrep
        for line in result.stdout.splitlines():
            if not line:
                continue
                
            parts = line.split(' ', 1) # Splits into 'PID' and 'COMMAND'
            if len(parts) < 2:
                continue
                
            pid_str, full_cmd = parts
            if not pid_str.isdigit():
                continue
                
            # Ignore the 'bash -c' parent process
            if not full_cmd.strip().startswith("python3"):
                continue
                
            pid = int(pid_str)
            
            # --- THIS IS THE NEW, STABLE FIX ---
            # 2. Parse arguments using regex
            try:
                # Find all --key=value pairs
                args_map = dict(re.findall(r'--(\w+)=([\w-]+)', full_cmd))
                
                owner = args_map.get('owner')
                project = args_map.get('project')
                mode = args_map.get('mode')

                if not owner or not project or not mode:
                    raise ValueError("Missing one or more required arguments")

            except Exception as e:
                print(f"Failed to parse cmd: '{full_cmd}' on {node_name}. Error: {e}", file=sys.stderr)
                continue
            # --- END OF FIX ---

            # 3. Get Uptime
            uptime_cmd = ssh_cmd_base + [f"ps -p {pid} -o etime="]
            uptime_result = subprocess.run(uptime_cmd, capture_output=True, text=True, timeout=5)
            uptime = uptime_result.stdout.strip()
            
            # Reconstruct the session name for consistency
            session_name = f"train:{owner}:{project}:{mode}"

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

# 4. Write output file
try:
    with open(OUTPUT_FILE, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")
    print(f"Successfully wrote {len(records)} jobs to {OUTPUT_FILE}")
except Exception as e:
    print(f"Error writing to {OUTPUT_FILE}: {e}", file=sys.stderr)