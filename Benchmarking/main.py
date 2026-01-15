from Benchmarking.runner.run_benchmark import run_pipeline

if __name__ == "__main__":
    user_cfg = {
        "task": "causal-lm",
        "model": "Qwen/Qwen2.5-0.5B-Instruct",
        "attention": "sequential",
        "steps": 10,
        "sequence_length": 512,
        "batch_size": 8
    }

    print(run_pipeline(user_cfg))
