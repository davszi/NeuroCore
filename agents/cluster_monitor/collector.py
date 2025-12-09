import json
import os
import time
import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class ClusterCollector:
    """
    Collects cluster state from existing metrics files or direct polling.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.metrics_file = config['paths']['metrics_file']
        self.jobs_file = config['paths']['jobs_file']

    def collect_metrics(self) -> List[Dict[str, Any]]:
        """
        Reads the latest metrics from the shared JSONL file.
        In a real scenario, this could fallback to SSH polling if the file is stale.
        """
        metrics = []
        if not os.path.exists(self.metrics_file):
            logger.warning(f"Metrics file not found: {self.metrics_file}")
            return []

        try:
            # Read the file line by line. In a real system, we might want to read only the last N lines
            # or handle file rotation. For now, we read the whole file and take the latest entry per node.
            with open(self.metrics_file, 'r') as f:
                for line in f:
                    if line.strip():
                        try:
                            metrics.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            
            # Deduplicate by node_name, keeping the latest
            latest_metrics = {}
            for m in metrics:
                node = m.get('node_name')
                if node:
                    latest_metrics[node] = m
            
            return list(latest_metrics.values())

        except Exception as e:
            logger.error(f"Error reading metrics: {e}")
            return []

    def collect_jobs(self) -> List[Dict[str, Any]]:
        """
        Reads the latest job info from the shared JSONL file.
        """
        jobs = []
        if not os.path.exists(self.jobs_file):
            logger.warning(f"Jobs file not found: {self.jobs_file}")
            return []

        try:
            with open(self.jobs_file, 'r') as f:
                for line in f:
                    if line.strip():
                        try:
                            jobs.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            return jobs
        except Exception as e:
            logger.error(f"Error reading jobs: {e}")
            return []

    def get_cluster_state(self) -> Dict[str, Any]:
        """
        Aggregates all data into a single state object.
        """
        return {
            "timestamp": time.time(),
            "nodes": self.collect_metrics(),
            "jobs": self.collect_jobs()
        }
