print("=== TEST IMPORT MONITOR_RUN ===")

try:
    from utils import monitor_run
    print("SUCCESS: monitor_run imported correctly!")
except Exception as e:
    print("IMPORT FAILED:", e)
    raise SystemExit

print("=== TEST CALLING monitor_run() ===")

try:
    out = monitor_run(
        model_name="test-model",
        dataset_name="test-dataset",
        task="test-task",
        dtype="float32",
        seq_len=128,
        attention_type="standard",
        fine_tune_method="none",
        train_loss=1.23,
        eval_loss=2.34,
        notes="This is a test"
    )
    print("SUCCESS: monitor_run executed without error.")
    print("Output:", out)
except Exception as e:
    print("CALL FAILED:", e)
    raise SystemExit

print("=== CHECKING IF FILE WAS CREATED ===")

import os

if os.path.exists("monitor_results/metrics.jsonl"):
    print("SUCCESS: metrics.jsonl exists!")
    print("\nFILE CONTENT (last line):")
    with open("monitor_results/metrics.jsonl", "r") as f:
        lines = f.readlines()
        print(lines[-1])
else:
    print("ERROR: metrics.jsonl WAS NOT CREATED")
