# Automated SSH Connectivity Test for Cluster Nodes
# This script reads node configurations from a YAML file and attempts to connect to each node via SSH.

import yaml, paramiko

# Load YAML config file
with open("config/nodes.yaml", "r", encoding="utf-8") as f:
    data = yaml.safe_load(f)

print("Starting automated SSH test for all nodes...\n")

# Iterate through each node and test SSH connectivity
for node in data["nodes"]:
    name = node["name"]
    host = node["host"]
    port = int(node["port"])
    user = node["user"]
    password = "cluster"

    print(f"Connecting to {name} ({host}:{port}) as {user} ...")
# Set up SSH client
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()) # Automatically add unknown host keys
    
# Attempt to connect and execute a command
    try:
        ssh.connect(hostname=host, port=port, username=user, password=password, timeout=5)
        stdin, stdout, stderr = ssh.exec_command("hostname")
        response = stdout.read().decode().strip()
        print(f"Connected successfully → {response}\n")
    except Exception as e:
        print(f"Connection failed: {e}\n")
    finally:
        ssh.close()

print("SSH validation completed for all nodes.")
