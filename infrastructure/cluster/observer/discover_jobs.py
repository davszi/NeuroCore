#!/usr/bin/env python3
import subprocess, json, sys, shlex, yaml, os

NODES_CONFIG_PATH = os.environ.get('CONFIG_NODES_PATH', '/config/nodes.yaml')
OUTPUT_FILE = "/neurocore/data/jobs.jsonl"
SSH_PASS = "cluster"

def load_nodes():
    try:
        with open(NODES_CONFIG_PATH, 'r') as f:
            config_data = yaml.safe_load(f)
            return config_data.get('nodes', [])
    except Exception as e:
        print(f"Error loading config {NODES_CONFIG_PATH}: {e}", file=sys.stderr)
        return []

records = []
nodes_to_poll = load_nodes()

if not nodes_to_poll:
    print("No nodes found in config file. Exiting.", file=sys.stderr)
    sys.exit(1)

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
            "-p", "22",
            f"{node_user}@{node_name}",
        ]
        
        search_cmd = "pgrep -af 'python3 -u /opt/neurocore/dummy_train.py'"
        find_cmd = ssh_cmd_base + [search_cmd]
        result = subprocess.run(find_cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 1:
            print(f"No 'dummy_train.py' processes found on {node_name}.")
            continue
        elif result.returncode != 0:
            print(f"Error running pgrep on {node_name}: {result.stderr}", file=sys.stderr)
            continue
            
        for line in result.stdout.splitlines():
            if not line:
                continue
                
            parts = line.split(' ', 1) 
            if len(parts) < 2:
                continue
                
            pid_str, full_cmd = parts
            if not pid_str.isdigit():
                continue
                
            pid = int(pid_str)
            
            if "|" in full_cmd:
                continue

            owner, project, mode = None, None, None
            
            try:
                py_cmd_args_str = full_cmd.split("dummy_train.py", 1)[1]
                args_list = shlex.split(py_cmd_args_str)
                
                args_map = {}
                for i, arg in enumerate(args_list):
                    if arg == '--owner' and i + 1 < len(args_list):
                        args_map['owner'] = args_list[i+1]
                    elif arg == '--project' and i + 1 < len(args_list):
                        args_map['project'] = args_list[i+1]
                    elif arg == '--mode' and i + 1 < len(args_list):
                        args_map['mode'] = args_list[i+1]
                
                owner = args_map.get('owner')
                project = args_map.get('project')
                mode = args_map.get('mode')

                if not owner or not project or not mode:
                    raise ValueError(f"Missing one or more required arguments in {args_list}")

            except Exception as e:
                print(f"Failed to parse cmd: '{full_cmd}' on {node_name}. Error: {e}", file=sys.stderr)
                continue
            
            uptime_cmd = ssh_cmd_base + [f"ps -p {pid} -o etime="]
            uptime_result = subprocess.run(uptime_cmd, capture_output=True, text=True, timeout=5)
            uptime = uptime_result.stdout.strip()
            
            session_name = f"train:{owner}:{project}:{mode}"

            log_file = f"/neurocore/logs/{session_name.replace(':','_')}.log"
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
