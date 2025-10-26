#!/usr/bin/env python3
import subprocess, json

# Nodes = local only for now
nodes = ["localhost"]

output_file = "data/jobs.jsonl"
records = []

for node in nodes:
    try:
        # List tmux sessions (locally)
        result = subprocess.run(
            ["tmux", "ls"], capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if line.startswith("train"):
                session_name = line.split(":")[0]

                # PID of main process
                pid_result = subprocess.run(
                    ["tmux", "display-message", "-p", "-t", session_name, "#{pane_pid}"],
                    capture_output=True, text=True
                )
                pid = int(pid_result.stdout.strip())

                # Uptime
                uptime_result = subprocess.run(
                    ["ps", "-p", str(pid), "-o", "etime="],
                    capture_output=True, text=True
                )
                uptime = uptime_result.stdout.strip()

                # Optional log preview
                log_file = f"/neurocore/logs/{session_name.replace(':','_')}.log"
                log_preview_result = subprocess.run(
                    ["tail", "-n", "5", log_file],
                    capture_output=True, text=True
                )
                log_preview = log_preview_result.stdout.splitlines()

                records.append({
                    "node": node,
                    "session": session_name,
                    "pid": pid,
                    "uptime": uptime,
                    "log_preview": log_preview
                })
    except Exception as e:
        print(f"Error: {e}")

# Write JSON lines
with open(output_file, "w") as f:
    for rec in records:
        f.write(json.dumps(rec) + "\n")

print(f"Done! See {output_file}")
