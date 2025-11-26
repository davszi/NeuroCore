import time, psutil, shutil, torch, json, os

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
    if output_dir is None:
        output_dir = os.path.join(BASE_DIR, "monitor_results")

    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0
    disk_used = shutil.disk_usage("/").used / (1024 ** 3)

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


def monitor_step(step, epoch, loss, learning_rate,output_dir, note=""):
    """
    Logs metrics at a specific training step (used by callback)
    """

    print("We use the path:", output_dir)
    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent()
    ram_usage = process.memory_info().rss / (1024 ** 3)
    gpu_mem = torch.cuda.memory_allocated() / (1024 ** 3) if torch.cuda.is_available() else 0

    record = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "type": "step",
        "step": step,
        "epoch": epoch,
        "loss": float(loss),
        "learning_rate": float(learning_rate),
        "cpu_usage_%": cpu_usage,
        "ram_usage_GB": round(ram_usage, 2),
        "gpu_mem_GB": round(gpu_mem, 2),
        "note": note
    }

    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "metrics_loader.jsonl")

    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")

    print(f"Logged step {step} → {path}")
    return record
