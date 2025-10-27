#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/data_out/logs"
mkdir -p "$LOG_DIR"

# --- FIX: Define a shared socket path in our shared volume ---
TMUX_SOCKET="/data_out/tmux.socket"
export TMUX_SOCKET

# Explicitly start the tmux server
tmux -S "$TMUX_SOCKET" start-server

# --- FIX: Make the socket file and its directory writable by all ---
# This ensures the SSH user can access the socket
chmod 777 /data_out
chmod 777 "$TMUX_SOCKET"

make_session () {
  local sess="train:$2:$3:$4"
  local owner="$2"
  local project="$3"
  local mode="$4"

  # Use the shared socket
  if tmux -S "$TMUX_SOCKET" has-session -t "$sess" 2>/dev/null; then
    echo "[ok] session exists: $sess"
    return
  fi

  echo "[+] creating session: $sess"
  local cmd="python3 -u /opt/neurocore/dummy_train.py --owner=$owner --project=$project --mode=$mode"
  cmd="$cmd | tee -a $LOG_DIR/${sess//:/_}.log"

  # Use the shared socket
  tmux -S "$TMUX_SOCKET" new-session -d -s "$sess" "$cmd"
}

tmux -V >/dev/null 2>&1 || { echo "tmux not found"; exit 1; }

make_session "train:alice:cvproj:lora" "alice" "cvproj" "lora"
make_session "train:bob:nlp:full"     "bob"   "nlp"    "full"

echo "✅ Sessions created."