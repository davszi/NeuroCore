#!/usr/bin/env python3
import argparse, random, time, sys, os
from datetime import datetime

# --- Parse arguments with defaults ---
parser = argparse.ArgumentParser()
parser.add_argument("--owner", default="default_owner", help="Owner name")
parser.add_argument("--project", default="default_project", help="Project name")
parser.add_argument("--mode", choices=["full", "lora"], default="full", help="Training mode")
args = parser.parse_args()

# --- Log setup ---
base_log_dir = "/mnt/c/Users/Hp/OneDrive/Desktop/NeuroCore/data/logs"
os.makedirs(base_log_dir, exist_ok=True)

# Create log file path based on parameters
log_filename = f"train_{args.owner}_{args.project}_{args.mode}.log"
log_path = os.path.join(base_log_dir, log_filename)

# --- Training simulation setup ---
random.seed(hash((args.owner, args.project, args.mode)) & 0xFFFFFFFF)
step = 0
loss = 2.0

# --- Start training loop ---
while True:
    step += 1
    loss = max(0.01, loss * (0.999 + random.uniform(-0.0005, 0.0005)))
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    line = f"[{ts}] owner={args.owner} project={args.project} mode={args.mode} step={step} loss={loss:.4f}"

    # Print to console
    print(line, flush=True)

    # Append to log file
    with open(log_path, "a") as log_file:
        log_file.write(line + "\n")

    time.sleep(3 + int(random.random() * 2))
