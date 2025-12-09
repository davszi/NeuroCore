$env:PYTHONPATH = "$PWD"
$env:AGENT_CONFIG_PATH = "agents/cluster_monitor/config.yaml"

python agents/cluster_monitor/main.py
