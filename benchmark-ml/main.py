import sys
import argparse
import json
import os

# Ensure we can import modules from current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from runner.run_benchmark import run_pipeline

def load_config(config_path):
    with open(config_path, 'r') as f:
        return json.load(f)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NeuroCore Benchmark Runner")
    parser.add_argument("--config", type=str, help="Path to the JSON configuration file")
    
    args = parser.parse_args()

    if args.config:
        # Production Mode: Run with config from API
        print(f"[Main] Loading config from: {args.config}")
        user_cfg = load_config(args.config)
        print(f"[Main] Configuration loaded: {user_cfg.get('task')} / {user_cfg.get('model')}")
        
        result = run_pipeline(user_cfg)
        print(json.dumps(result, indent=2))
        
    else:
        # Fallback / Dev Mode
        print("[Main] No config file provided. Using hardcoded defaults.")
        user_cfg = {
            "task": "summarization",
            "model": "t5-small",
            "attention": "flash",
            "steps": 10
        }
        run_pipeline(user_cfg)