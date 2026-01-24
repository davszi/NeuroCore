import json
import os
from typing import Dict, Any

# Adjust path relative to where this script runs
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(BASE_DIR, "configs")

def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r") as f:
        return json.load(f)

def merge_user_config(user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    # 1. Load Defaults
    raw_task = user_cfg.get("task", "summarization")
    
    # Map Frontend Task Names -> Backend Config Keys
    TASK_MAPPING = {
        "text-generation": "causal-lm",
        "translation": "summarization",
        "summarization": "summarization",
        "classification": "classification",
        "causal-lm": "causal-lm"
    }
    
    backend_task = TASK_MAPPING.get(raw_task, raw_task)
    model_name = user_cfg.get("model", "t5-small")
    attention_ui = user_cfg.get("attention", "flash")
    
    # 2. Load Config Files
    attention_cfg = load_json(os.path.join(CONFIG_DIR, "attention.json"))
    training_cfg  = load_json(os.path.join(CONFIG_DIR, "training_defaults.json"))
    general_cfg   = load_json(os.path.join(CONFIG_DIR, "general.json"))
    datasets_cfg  = load_json(os.path.join(CONFIG_DIR, "datasets.json"))

    if backend_task not in datasets_cfg:
        raise ValueError(f"Task '{raw_task}' (mapped to '{backend_task}') not found in datasets.json")

    # 3. Apply Overrides from UI
    
    # Sequence Length
    if "sequence_length" in user_cfg:
        seq_len = int(user_cfg["sequence_length"])
        datasets_cfg[backend_task]["max_input_len"] = seq_len
        if backend_task == "summarization": 
            datasets_cfg[backend_task]["max_target_len"] = min(seq_len, 128)

    # Batch Size
    if "batch_size" in user_cfg:
        training_cfg["per_device_train_batch_size"] = int(user_cfg["batch_size"])
    
    # Steps
    if "steps" in user_cfg:
        steps = int(user_cfg["steps"])
        training_cfg["logging_steps"] = steps
        training_cfg["eval_steps"] = steps
        training_cfg["save_steps"] = steps * 10 

    # Learning Rate Override ---
    if "learning_rate" in user_cfg:
        training_cfg["learning_rate"] = float(user_cfg["learning_rate"])

    # 4. Construct Final Config
    return {
        "task": backend_task,
        "original_task": raw_task,
        "model_name": model_name,
        "dataset": datasets_cfg[backend_task],
        "attention": {
            "ui_choice": attention_ui,
            "impl": attention_cfg[attention_ui]["impl"],
            "dtype": attention_cfg[attention_ui]["dtype"]
        },
        "training": training_cfg,
        "general": general_cfg,
        "train_samples": int(user_cfg.get("train_samples", 512)),
        "eval_samples": int(user_cfg.get("eval_samples", 128))
    }