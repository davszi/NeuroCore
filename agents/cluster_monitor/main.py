#!/usr/bin/env python3
import os
import yaml
import logging
import sys
from agents.cluster_monitor.agent import ClusterMonitorAgent

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("ClusterMonitor")

def load_config(path):
    if not os.path.exists(path):
        logger.error(f"Config file not found: {path}")
        sys.exit(1)
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def main():
    config_path = os.environ.get('AGENT_CONFIG_PATH', 'agents/cluster_monitor/config.yaml')
    
    # If running in Docker, the path might be different
    if not os.path.exists(config_path):
        # Fallback for Docker mount
        config_path = "/app/agents/cluster_monitor/config.yaml"

    logger.info(f"Loading config from {config_path}")
    config = load_config(config_path)
    
    agent = ClusterMonitorAgent(config)
    agent.run()

if __name__ == "__main__":
    main()
