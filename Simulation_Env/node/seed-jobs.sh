#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/data_out/logs"
mkdir -p "$LOG_DIR"

# Just use the default tmux binary path
TMUX_BIN="/usr/bin/tmux"

# Start the default server for this user
"$TMUX_BIN" start-server

make_session () {
  # We still use colons for the session name
  local sess="train:$2:$3:$4"
  local owner="$2"
  local project="$3"
  local mode="$4"

  # Use default tmux socket
  if "$TMUX_BIN" has-session -t "$sess" 2>/dev/null; then
    echo "[ok] session exists: $sess"
    return
  fi

  echo "[+] creating session: $sess"
  # This is the command we will search for with pgrep
  local cmd_base="python3 -u /opt/neurocore/dummy_train.py --owner=$owner --project=$project --mode=$mode"
  # Log to the shared volume
  local cmd_with_log="$cmd_base | tee -a $LOG_DIR/${sess//:/_}.log"

  # Use default tmux socket. The -c flag ensures the command runs in the home dir.
  "$TMUX_BIN" new-session -d -s "$sess" "$cmd_with_log"
}

"$TMUX_BIN" -V >/dev/null 2>/dev/null || { echo "tmux not found"; exit 1; }

make_session "train:alice:cvproj:lora" "alice" "cvproj" "lora"
make_session "train:bob:nlp:full"     "bob"   "nlp"    "full"

echo "✅ Sessions created for $HOSTNAME."