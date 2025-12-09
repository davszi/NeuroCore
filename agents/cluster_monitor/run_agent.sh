#!/bin/bash
export PYTHONPATH=$PWD
export AGENT_CONFIG_PATH=agents/cluster_monitor/config.yaml

python3 agents/cluster_monitor/main.py
