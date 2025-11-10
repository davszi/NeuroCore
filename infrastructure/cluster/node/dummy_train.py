#!/usr/bin/env python3
import argparse, random, time, sys
from datetime import datetime

parser = argparse.ArgumentParser()
parser.add_argument("--owner", default="default_owner", help="Owner name")
parser.add_argument("--project", default="default_project", help="Project name")
parser.add_argument("--mode", choices=["full", "lora"], default="full", help="Training mode")
args = parser.parse_args()

random.seed(hash((args.owner, args.project, args.mode)) & 0xFFFFFFFF)
step = 0
loss = 2.0

while True:
    step += 1
    loss = max(0.01, loss * (0.999 + random.uniform(-0.0005, 0.0005)))
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] owner={args.owner} project={args.project} mode={args.mode} step={step} loss={loss:.4f}"
    print(line, flush=True)
    time.sleep(3 + int(random.random() * 2))
