from typing import Dict, Any

from Benchmarking.runner.run_benchmark import run_pipeline


def handle_submission(user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Primește dictul venit de la FastAPI (UserConfig),
    rulează tot pipeline-ul și întoarce un JSON pentru dashboard.
    """
    results = run_pipeline(user_cfg)
    return {
        "status": "completed",
        "results": results
    }
