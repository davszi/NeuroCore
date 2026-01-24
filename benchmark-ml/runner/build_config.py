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
    
    # [FIX] Map Frontend Task Names -> Backend Config Keys
    # The dashboard sends "text-generation", but datasets.json has "causal-lm"
    TASK_MAPPING = {
        "text-generation": "causal-lm",
        "translation": "summarization",  # Both are Seq2Seq
        "summarization": "summarization",
        "classification": "classification",
        "causal-lm": "causal-lm"
    }
    
    # Resolve the correct backend key
    backend_task = TASK_MAPPING.get(raw_task, raw_task)

    model_name = user_cfg.get("model", "t5-small")
    attention_ui = user_cfg.get("attention", "flash")
    
    # 2. Load Config Files
    attention_cfg = load_json(os.path.join(CONFIG_DIR, "attention.json"))
    training_cfg  = load_json(os.path.join(CONFIG_DIR, "training_defaults.json"))
    general_cfg   = load_json(os.path.join(CONFIG_DIR, "general.json"))
    datasets_cfg  = load_json(os.path.join(CONFIG_DIR, "datasets.json"))

    # Validate Task
    if backend_task not in datasets_cfg:
        raise ValueError(f"Task '{raw_task}' (mapped to '{backend_task}') not found in datasets.json")

    # 3. Apply Overrides from UI
    # Sequence Length Override
    if "sequence_length" in user_cfg:
        seq_len = int(user_cfg["sequence_length"])
        datasets_cfg[backend_task]["max_input_len"] = seq_len
        
        # For summarization/translation, target length usually shorter
        if backend_task == "summarization": 
            datasets_cfg[backend_task]["max_target_len"] = min(seq_len, 128)

    # Batch Size Override
    if "batch_size" in user_cfg:
        training_cfg["per_device_train_batch_size"] = int(user_cfg["batch_size"])
    
    # Steps Override
    if "steps" in user_cfg:
        steps = int(user_cfg["steps"])
        training_cfg["logging_steps"] = steps
        training_cfg["eval_steps"] = steps
        training_cfg["save_steps"] = steps * 10 

    # 4. Construct Final Config
    return {
        "task": backend_task,          # Send the CORRECT key to train.py
        "original_task": raw_task,     # Keep original for reference
        "model_name": model_name,
        "dataset": datasets_cfg[backend_task],
        "attention": {
            "ui_choice": attention_ui,
            "impl": attention_cfg[attention_ui]["impl"],
            "dtype": attention_cfg[attention_ui]["dtype"]
        },
        "training": training_cfg,
        "general": general_cfg,
        # Pass through dynamic UI overrides
        "train_samples": int(user_cfg.get("train_samples", 512)),
        "eval_samples": int(user_cfg.get("eval_samples", 128))
    }