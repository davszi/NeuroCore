import time, psutil, shutil, torch, json, os, math
from glob import glob

# ---------------------------------------------------------
# GLOBAL TIMER — set this when training starts
# ---------------------------------------------------------
TRAINING_START_TIME = time.time()
directory = "configuration"

# Get all JSON files in the directory
json_files = glob(os.path.join(directory, "*.json"))

# Make sure some exist
if not json_files:
    raise FileNotFoundError("No JSON files found")

# Get the most recently modified one
latest_file = max(json_files, key=os.path.getmtime)

# Load it
with open(latest_file, "r") as f:
        supp_datasets_conf = json.load(f)

def monitor_run(
    model_name: str,
    dataset_name: str,
    task: str,
    dtype: str,
    seq_len: int,
    attention_type: str,
    fine_tune_method: str,
    train_loss: float,
    eval_loss: float,
    notes: str = "",
    output_dir: str = None
):
    global TRAINING_START_TIME

    if output_dir is None:
        output_dir = os.path.join(BASE_DIR, "monitor_results")

    # ------------ compute metrics ----------
    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0
    disk_used = shutil.disk_usage("/").used / (1024 ** 3)

    # ------------ perplexity ----------
    train_ppl = math.exp(train_loss) if train_loss is not None else None
    eval_ppl  = math.exp(eval_loss) if eval_loss  is not None else None

    # ------------ total training time ----------
    training_time_sec = time.time() - TRAINING_START_TIME

    metrics = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": model_name,
        "dataset": dataset_name,
        "task": task,
        "dtype": dtype,
        "seq_len": seq_len,
        "attention": attention_type,
        "fine_tune_method": fine_tune_method,

        "train_loss": train_loss,
        "eval_loss": eval_loss,
        "train_perplexity": train_ppl,
        "eval_perplexity": eval_ppl,

        "training_time_seconds": training_time_sec,
        "training_time_hours": round(training_time_sec / 3600, 2),

        "cpu_usage_%": cpu_usage,
        "ram_usage_GB": round(ram_usage, 2),
        "gpu_mem_GB": round(gpu_mem, 2),
        "disk_used_GB": round(disk_used, 3),
        "notes": notes
    }

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "metrics.jsonl")

    with open(path, "a") as f:
        f.write(json.dumps(metrics) + "\n")

    print(f"\n Saved monitoring metrics → {path}")
    return metrics



def monitor_step(step, epoch, loss, learning_rate, output_dir, note=""):
    """
    Logs metrics at a specific training step (used by callback)
    """

    global TRAINING_START_TIME

    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0

    # -------- perplexity per step ----------
    ppl = math.exp(loss) if loss is not None else None

    # -------- running training time --------
    training_time_sec = time.time() - TRAINING_START_TIME

    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "type": "step",
        "step": step,
        "epoch": epoch,
        "loss": float(loss),
        "perplexity": ppl,
        "learning_rate": float(learning_rate),

        "training_time_seconds": training_time_sec,
        "training_time_hours": round(training_time_sec / 3600, 2),

        "cpu_usage_%": cpu_usage,
        "ram_usage_GB": round(ram_usage, 2),
        "gpu_mem_GB": round(gpu_mem, 2),
        "note": note
    }

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, f"{supp_datasets_conf["general"]["attn_implementation"]}.jsonl")

    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")

    print(f"Logged step {step} → {path}")
    return record
