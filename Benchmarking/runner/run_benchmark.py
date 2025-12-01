from Benchmarking.runner.build_config import merge_user_config
from Benchmarking.runner.train import run_training

def run_pipeline(user_cfg):
    final_cfg = merge_user_config(user_cfg)
    result = run_training(final_cfg)

    return {
        "status": "completed",
        "task": final_cfg["task"],
        "model": final_cfg["model_name"],
        "attention": final_cfg["attention"]["ui_choice"],
        "train_loss": result["train_loss"],
        "eval_metrics": result["eval_metrics"],
        "monitor_record": result["monitor_record"],
        "output_dir": result["output_dir"],
        "lora_info": result.get("lora_info")
    }
