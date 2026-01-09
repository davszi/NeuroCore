#!/usr/bin/env python3
"""
Simple training script for performance comparison benchmarks.
This script trains a small model on a dataset to measure training time.
"""

import argparse
import json
import time
import sys
from datetime import datetime

def parse_args():
    parser = argparse.ArgumentParser(description='Run comparison benchmark training')
    parser.add_argument('--config', type=str, required=True, help='Path to config JSON file')
    return parser.parse_args()

def load_config(config_path):
    """Load configuration from JSON file"""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading config: {e}", file=sys.stderr)
        sys.exit(1)

def simulate_training(config):
    """
    Simulate a training run.
    In a real scenario, this would train an actual model.
    For now, we'll simulate work with sleep and some computation.
    """
    print(f"[{datetime.now()}] Starting training with config: {json.dumps(config, indent=2)}")
    
    batch_size = config.get('batch_size', 8)
    num_epochs = config.get('num_epochs', 3)
    max_length = config.get('max_length', 128)
    
    # Simulate training steps
    total_steps = num_epochs * 100  # Assume 100 batches per epoch
    
    print(f"[{datetime.now()}] Training for {num_epochs} epochs, {total_steps} total steps")
    
    for epoch in range(num_epochs):
        print(f"\n[{datetime.now()}] Epoch {epoch + 1}/{num_epochs}")
        
        for step in range(100):
            # Simulate some computation
            _ = sum(i ** 2 for i in range(1000))
            
            if step % 20 == 0:
                loss = 2.0 * (0.95 ** (epoch * 100 + step))
                print(f"[{datetime.now()}] Step {epoch * 100 + step}/{total_steps}, Loss: {loss:.4f}")
            
            # Small sleep to simulate I/O and other operations
            time.sleep(0.1)
    
    print(f"\n[{datetime.now()}] Training completed successfully!")

def main():
    args = parse_args()
    config = load_config(args.config)
    
    start_time = time.time()
    print(f"[{datetime.now()}] ========== TRAINING START ==========")
    
    try:
        simulate_training(config)
    except Exception as e:
        print(f"[{datetime.now()}] Error during training: {e}", file=sys.stderr)
        sys.exit(1)
    
    end_time = time.time()
    duration = end_time - start_time
    
    print(f"[{datetime.now()}] ========== TRAINING COMPLETE ==========")
    print(f"[{datetime.now()}] Total duration: {duration:.2f} seconds")
    
    # Save results
    output_dir = config.get('output_dir', '/tmp')
    results = {
        'duration': duration,
        'start_time': start_time,
        'end_time': end_time,
        'config': config,
        'status': 'success'
    }
    
    try:
        results_path = f"{output_dir}/results.json"
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"[{datetime.now()}] Results saved to {results_path}")
    except Exception as e:
        print(f"[{datetime.now()}] Warning: Could not save results: {e}", file=sys.stderr)

if __name__ == '__main__':
    main()
