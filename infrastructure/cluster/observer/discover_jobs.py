#!/usr/bin/env python3
import subprocess, json, sys, shlex, yaml, os

CONFIG_FILE = "/mnt/c/Users/Hp/OneDrive/Desktop/NeuroCore/config/nodes.yaml"
OUTPUT_FILE = "/mnt/c/Users/Hp/OneDrive/Desktop/NeuroCore/data/jobs.jsonl"

# Load nodes from YAML
try:
    with open(CONFIG_FILE, "r") as f:
        config = yaml.safe_load(f)
        NODES = config.get("nodes", [])
except Exception:
    # Silent fail instead of printing errors
    sys.exit(1)

records = []

for node in NODES:
    node_name = node.get("name")
    host = node.get("host")
    port = str(node.get("port", "22"))
    ssh_user = node.get("user", "cluster")

    if not node_name or not host:
        continue  # silently skip invalid node configs

    run_locally = host in ("localhost", "127.0.0.1")

    try:
        if run_locally:
            def run_cmd(cmd, timeout=10):
                return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        else:
            SSH_PASS = "cluster"
            def run_cmd(cmd, timeout=10):
                ssh_cmd_base = [
                    "sshpass", "-p", SSH_PASS,
                    "ssh", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
                    "-p", port,
                    f"{ssh_user}@{host}",
                ]
                return subprocess.run(ssh_cmd_base + [cmd], capture_output=True, text=True, timeout=timeout)

        search_cmd = "pgrep -af 'python3.*dummy_train.py'"
        result = run_cmd(search_cmd, timeout=10)

        if result.returncode != 0:
            continue

        for line in result.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split(' ', 1)
            if len(parts) < 2 or not parts[0].isdigit():
                continue

            pid = int(parts[0])
            full_cmd = parts[1].strip()

            if "dummy_train.py" not in full_cmd:
                continue

            args_map = {"owner": "default_owner", "project": "default_project", "mode": "full"}
            try:
                py_cmd_args_str = full_cmd.split("dummy_train.py", 1)[1]
                args_list = shlex.split(py_cmd_args_str)
                for i, arg in enumerate(args_list):
                    if arg == '--owner' and i + 1 < len(args_list):
                        args_map['owner'] = args_list[i + 1]
                    elif arg == '--project' and i + 1 < len(args_list):
                        args_map['project'] = args_list[i + 1]
                    elif arg == '--mode' and i + 1 < len(args_list):
                        args_map['mode'] = args_list[i + 1]
            except Exception:
                pass

            owner = args_map["owner"]
            project = args_map["project"]
            mode = args_map["mode"]

            uptime_cmd = f"ps -p {pid} -o etime="
            uptime_result = run_cmd(uptime_cmd, timeout=5)
            uptime = uptime_result.stdout.strip()

            session_name = f"train:{owner}:{project}:{mode}"
            log_file = f"/mnt/c/Users/Hp/OneDrive/Desktop/NeuroCore/data/logs/{session_name.replace(':','_')}.log"

            log_cmd = f"tail -n 5 {log_file} 2>/dev/null || true"
            log_result = run_cmd(log_cmd, timeout=5)

            records.append({
                "node": node_name,
                "session": session_name,
                "pid": pid,
                "uptime": uptime,
                "log_file": log_file,  # ✅ added full log path
                "log_preview": log_result.stdout.splitlines()
            })

    except Exception:
        continue  # skip node silently

# Write output (no console prints)
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
with open(OUTPUT_FILE, "w") as f:
    for rec in records:
        f.write(json.dumps(rec) + "\n")
