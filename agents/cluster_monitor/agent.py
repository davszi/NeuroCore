import time
import logging
from typing import Dict, Any
from .collector import ClusterCollector
from .heuristics import HeuristicEngine
from .actions import ActionManager

logger = logging.getLogger(__name__)

class ClusterMonitorAgent:
    """
    Main agent class that orchestrates collection, analysis, and action.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.collector = ClusterCollector(config)
        self.heuristics = HeuristicEngine(config)
        self.actions = ActionManager(config)
        self.running = False

    def run(self):
        """
        Starts the main loop.
        """
        self.running = True
        interval = self.config.get('agent', {}).get('poll_interval_seconds', 30)
        
        logger.info(f"ClusterMonitorAgent started. Poll interval: {interval}s")

        while self.running:
            try:
                # 1. Collect
                state = self.collector.get_cluster_state()
                
                # 2. Analyze
                recommendations = self.heuristics.analyze(state)
                
                # 3. Act
                if recommendations:
                    self.actions.execute(recommendations)
                
            except Exception as e:
                logger.error(f"Error in agent loop: {e}")

            time.sleep(interval)

    def stop(self):
        self.running = False
