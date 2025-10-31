#!/usr/bin/env python3
import argparse, random, time, sys

parser = argparse.ArgumentParser()
parser.add_argument("--owner", required=True)
parser.add_argument("--project", required=True)
parser.add_argument("--mode", choices=["full", "lora"], required=True)
args = parser.parse_args()

random.seed(hash((args.owner, args.project, args.mode)) & 0xFFFFFFFF)
step = 0
loss = 2.0

while True:
    step += 1
    loss = max(0.01, loss * (0.999 + random.uniform(-0.0005, 0.0005)))
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] owner={args.owner} project={args.project} mode={args.mode} step={step} loss={loss:.4f}", flush=True)
    time.sleep(3 + int(random.random() * 2))