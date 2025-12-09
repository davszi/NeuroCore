import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

class ActionManager:
    """
    Executes actions based on recommendations.
    """
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.mode = config.get('agent', {}).get('mode', 'recommendation')
        self.dry_run = config.get('agent', {}).get('dry_run', True)

    def execute(self, recommendations: List[Dict[str, Any]]):
        """
        Processes recommendations. In 'auto-action' mode, it might trigger changes.
        In 'recommendation' mode, it just logs them.
        """
        for rec in recommendations:
            self._handle_recommendation(rec)

    def _handle_recommendation(self, rec: Dict[str, Any]):
        msg = f"[{rec.get('severity', 'INFO')}] {rec.get('message')}"
        
        if self.mode == 'recommendation':
            logger.info(f"RECOMMENDATION: {msg}")
        
        elif self.mode == 'auto-action':
            if self.dry_run:
                logger.info(f"DRY-RUN ACTION: Would execute fix for: {msg}")
            else:
                logger.info(f"EXECUTING ACTION: Addressing: {msg}")
                # TODO: Implement actual logic here (e.g., SSH to node and kill job)
                pass
