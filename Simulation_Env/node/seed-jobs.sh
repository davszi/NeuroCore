#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/data_out/logs"
mkdir -p "$LOG_DIR"

make_session () {
  # FIX 1: Session name now uses colons as required
  local sess="train:$2:$3:$4"
  local owner="$2"
  local project="$3"
  local mode="$4"

  if tmux has-session -t "$sess" 2>/dev/null; then
    echo "[ok] session exists: $sess"
    return
  fi

  echo "[+] creating session: $sess"

  # FIX 2: Path is now absolute inside the container
  local cmd="python3 -u /opt/neurocore/dummy_train.py --owner=$owner --project=$project --mode=$mode"

  # Log to the shared data-exchange volume
  cmd="$cmd | tee -a $LOG_DIR/${sess//:/_}.log"

  tmux new-session -d -s "$sess" "$cmd"
}

tmux -V >/dev/null 2>&1 || { echo "tmux not found"; exit 1; }

make_session "train:alice:cvproj:lora" "alice" "cvproj" "lora"
make_session "train:bob:nlp:full"     "bob"   "nlp"    "full"

echo "✅ Sessions created."