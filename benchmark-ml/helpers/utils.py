import json
import os
import time
import shutil
from typing import Optional, Dict, Any

import psutil
import torch

def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def monitor_run(
    config: Dict[str, Any],
    train_loss: float,
    eval_loss: Optional[float],
    training_time: float,
    output_dir: str
) -> Dict[str, Any]:
    """
    Log final metrics for a run.
    CRITICAL FOR DASHBOARD: Writes directly to output_dir, no subfolders.
    """
    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0
    
    try:
        disk_used = shutil.disk_usage("/").used / (1024 ** 3)
    except:
        disk_used = 0

    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "config": config,
        "train_loss": float(train_loss),
        "eval_loss": float(eval_loss) if eval_loss is not None else None,
        "training_time_sec": training_time,
        "cpu_usage_percent": cpu_usage,
        "ram_usage_GB": round(ram_usage, 2),
        "gpu_mem_GB": round(gpu_mem, 2),
        "disk_used_GB": round(disk_used, 3)
    }

    _ensure_dir(output_dir)
    
    # Write flat file for Dashboard discovery
    path = os.path.join(output_dir, "run_metrics.jsonl")
    
    try:
        with open(path, "a") as f:
            f.write(json.dumps(record) + "\n")
            f.flush()
            os.fsync(f.fileno())
        print(f"[monitor] Saved run metrics -> {path}")
    except Exception as e:
        print(f"[monitor] Failed to save metrics: {e}")

    return record


def monitor_step(
    step: int,
    epoch: float,
    loss: float,
    learning_rate: Optional[float],
    output_dir: str,
    note: str = ""
) -> Dict[str, Any]:
    """
    Log per-step metrics.
    """
    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0

    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "step": step,
        "epoch": epoch,
        "loss": float(loss),
        "learning_rate": float(learning_rate) if learning_rate is not None else None,
        "cpu_usage_percent": cpu_usage,
        "ram_usage_GB": round(ram_usage, 2),
        "gpu_mem_GB": round(gpu_mem, 2),
        "note": note
    }

    _ensure_dir(output_dir)
    
    path = os.path.join(output_dir, "step_metrics.jsonl")
    try:
        with open(path, "a") as f:
            f.write(json.dumps(record) + "\n")
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        pass # Don't crash training for a logging error

    return record