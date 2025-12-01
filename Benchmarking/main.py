from Benchmarking.runner.run_benchmark import run_pipeline

if __name__ == "__main__":
    user_cfg = {
        "task": "summarization",
        "model": "t5-small",
        "attention": "flash",
        "steps": 10
    }
    print(run_pipeline(user_cfg))
