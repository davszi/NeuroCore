#!/usr/bin/env bash
set -euo pipefail

# Path to tmux socket (shared across terminals)
TMUX_SOCKET="/tmp/neurocore_tmux"

# Ensure logs directory exists
LOG_DIR="/neurocore/logs"
mkdir -p "$LOG_DIR"
#chmod 777 "$LOG_DIR"

# Helper to create a session if it doesn't exist
make_session() {
  local sess="$1"       # e.g., train_alice_cvproj_lora
  local owner="$2"
  local project="$3"
  local mode="$4"

  if tmux -S "$TMUX_SOCKET" has-session -t "$sess" 2>/dev/null; then
    echo "[ok] session exists: $sess"
    return
  fi

  echo "[+] creating session: $sess"

  local cmd="python3 -u /mnt/c/Users/Hp/OneDrive/Desktop/Msc/Sem\ 3/Project/NeuroCore/Simulation_Env/dummy_train.py --owner=$owner --project=$project --mode=$mode"

  # If logs dir exists, tee to file
  if [ -d "$LOG_DIR" ]; then
    cmd="$cmd | tee -a $LOG_DIR/${sess}.log"
  fi

  tmux -S "$TMUX_SOCKET" new-session -d -s "$sess" "$cmd"
}

# Ensure tmux is installed
tmux -V >/dev/null 2>&1 || { echo "tmux not found"; exit 1; }

# Create sessions idempotently
make_session "train_alice_cvproj_lora" "alice" "cvproj" "lora"
make_session "train_bob_nlp_full"     "bob"   "nlp"    "full"

echo "✅ Sessions created (or already exist)."
echo "Use: tmux -S $TMUX_SOCKET ls   to list sessions"
echo "     tmux -S $TMUX_SOCKET attach -t <session>  to attach"
echo "     tmux -S $TMUX_SOCKET capture-pane -pt <session> | tail -n 5  to view logs"
