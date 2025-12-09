import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class HeuristicEngine:
    """
    Analyzes cluster state to detect inefficiencies.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.thresholds = config.get('thresholds', {})

    def analyze(self, state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Runs heuristics on the cluster state and returns a list of recommendations.
        """
        recommendations = []
        nodes = state.get('nodes', [])
        jobs = state.get('jobs', [])

        # 1. Check for Idle GPUs
        idle_gpus = self._check_idle_gpus(nodes)
        if idle_gpus:
            recommendations.extend(idle_gpus)

        # 2. Check for Low Cluster Utilization
        low_util = self._check_cluster_utilization(nodes)
        if low_util:
            recommendations.append(low_util)

        return recommendations

    def _check_idle_gpus(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        recs = []
        gpu_idle_thresh = self.thresholds.get('gpu_idle_percent', 95.0)

        for node in nodes:
            node_name = node.get('node_name')
            gpus = node.get('gpus', [])
            for gpu in gpus:
                util = gpu.get('utilization_percent', 0)
                if util < (100 - gpu_idle_thresh): # e.g. < 5% utilization
                    recs.append({
                        "type": "IDLE_GPU",
                        "severity": "MEDIUM",
                        "node": node_name,
                        "gpu_id": gpu.get('gpu_id'),
                        "message": f"GPU {gpu.get('gpu_id')} on {node_name} is idle (Util: {util}%). Consider scheduling pending jobs."
                    })
        return recs

    def _check_cluster_utilization(self, nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not nodes:
            return None

        total_util = 0
        count = 0
        for node in nodes:
            # Simple CPU average for now
            total_util += node.get('cpu_util_percent', 0)
            count += 1
        
        avg_util = total_util / count if count > 0 else 0
        min_util = self.thresholds.get('min_utilization_percent', 40.0)

        if avg_util < min_util:
             return {
                "type": "LOW_UTILIZATION",
                "severity": "INFO",
                "message": f"Cluster average CPU utilization is low ({avg_util:.1f}%). You have capacity for more jobs."
            }
        return None
