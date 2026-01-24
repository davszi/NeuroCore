INSTALL_DIR=$1
cd "$INSTALL_DIR"

# 1. Setup Logging with Timestamps
LOG_FILE="setup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
    echo -e "\n[$(date +'%H:%M:%S')] $1"
}

log "--- NEW DEPLOYMENT STARTED ---"
log "Working directory: $(pwd)"

# 2. Robust Virtual Environment
if [ ! -d "venv" ]; then
    log "Creating Virtual Environment..."
    
    # Try standard method first
    if python3 -m venv venv; then
        log "✅ Standard 'python3 -m venv' successful."
    else
        log "⚠️ Standard venv failed (likely missing python3-venv package)."
        log "🔄 Attempting fallback: Installing 'virtualenv' locally..."
        
        # Fallback: Install virtualenv to user space (No Sudo required)
        python3 -m pip install --user --upgrade virtualenv --quiet
        
        # Add local bin to PATH temporarily for this script
        export PATH="$HOME/.local/bin:$PATH"
        
        # Try creating venv using the fallback
        if virtualenv venv; then
            log "✅ Fallback 'virtualenv' successful."
        else
            log "❌ CRITICAL ERROR: Could not create virtual environment."
            exit 1
        fi
    fi
else
    log "✅ Virtual Environment already exists. Skipping creation."
fi

# 3. Activate Environment
source venv/bin/activate
log "Virtual Environment Activated: $(which python)"

# 4. Fast Dependency Installation
log "Upgrading pip..."
pip install --upgrade pip --quiet

log "Installing/Syncing Dependencies..."
# --prefer-binary: Prevents long compilation times by forcing use of wheels
# --exists-action i: Ignores existing files (speeds up git deps if any)
pip install --prefer-binary -r requirements.txt

log "SETUP_COMPLETE_SIGNAL"