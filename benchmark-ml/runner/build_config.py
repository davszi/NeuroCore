import json
import os
from typing import Dict, Any

# Ensure we look for configs relative to THIS file, not the execution directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(BASE_DIR, "configs")

TRAIN_SAMPLES_DEFAULT = 512
EVAL_SAMPLES_DEFAULT = 128

def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r") as f:
        return json.load(f)

def _build_config_from_dict(user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    task = user_cfg["task"]
    model_name = user_cfg["model"]
    attention_ui = user_cfg["attention"]
    
    # Load configs dynamically
    models_cfg    = load_json(os.path.join(CONFIG_DIR, "models.json"))
    datasets_cfg  = load_json(os.path.join(CONFIG_DIR, "datasets.json"))
    attention_cfg = load_json(os.path.join(CONFIG_DIR, "attention.json"))
    training_cfg  = load_json(os.path.join(CONFIG_DIR, "training_defaults.json"))
    general_cfg   = load_json(os.path.join(CONFIG_DIR, "general.json"))

    if task not in models_cfg:
        raise ValueError(f"Unknown task '{task}'")
    if model_name not in models_cfg[task]:
        raise ValueError(f"Model '{model_name}' not allowed for task '{task}'")
    if attention_ui not in attention_cfg:
        raise ValueError(f"Attention '{attention_ui}' not allowed")

    dataset_cfg = datasets_cfg[task]
    attn_impl  = attention_cfg[attention_ui]["impl"]

    return {
        "task": task,
        "model_name": model_name,
        "dataset": dataset_cfg,
        "attention": {
            "ui_choice": attention_ui,
            "impl": attn_impl,
            "dtype": "bf16"
        },
        "training": training_cfg,
        "general": general_cfg,
        "train_samples": TRAIN_SAMPLES_DEFAULT,
        "eval_samples": EVAL_SAMPLES_DEFAULT,
    }

def merge_user_config(user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _build_config_from_dict(user_cfg)
    cfg["training"]["logging_steps"] = user_cfg.get("steps", 10)
    cfg["training"]["eval_steps"] = user_cfg.get("steps", 10)

    # Allow Dashboard overrides
    if "batch_size" in user_cfg and user_cfg["batch_size"] is not None:
        cfg["training"]["per_device_train_batch_size"] = int(user_cfg["batch_size"])

    if "sequence_length" in user_cfg and user_cfg["sequence_length"] is not None:
        seq_len = int(user_cfg["sequence_length"])
        cfg["dataset"]["max_input_len"] = seq_len
        
        # Summarization target length logic
        if cfg["task"] == "summarization":
            cfg["dataset"]["max_target_len"] = min(cfg["dataset"].get("max_target_len", 128), max(32, seq_len // 4))
            
    # Inject output_dir override if present (Critical for Dashboard)
    if "output_dir" in user_cfg.get("general", {}):
        cfg["general"]["output_dir"] = user_cfg["general"]["output_dir"]

    return cfg