import os
import sys
import time
import torch
import math
from transformers import (
    AutoModelForSeq2SeqLM, 
    AutoModelForSequenceClassification, 
    AutoModelForCausalLM,
    TrainingArguments, 
    Trainer, 
    DataCollatorForSeq2Seq,
    DataCollatorWithPadding,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, TaskType

# Allow imports from parent directories
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from helpers.data_loader import load_task_datasets
from helpers.attention_switcher import apply_attention_implementation
from helpers.step_callback import CustomMonitorCallback
from helpers.utils import monitor_run

def get_model_class(task):
    if task == "summarization":
        return AutoModelForSeq2SeqLM, TaskType.SEQ_2_SEQ_LM
    elif task == "classification":
        return AutoModelForSequenceClassification, TaskType.SEQ_CLS
    elif task == "causal-lm":
        return AutoModelForCausalLM, TaskType.CAUSAL_LM
    else:
        raise ValueError(f"Unknown task: {task}")

def run_training(final_cfg):
    print("--- Starting Training Pipeline ---")
    
    # 1. Setup Configuration
    general_cfg = final_cfg["general"]
    training_cfg = final_cfg["training"]
    attn_cfg = final_cfg["attention"]
    
    model_name = final_cfg["model_name"]
    task = final_cfg["task"]
    
    # Ensure output directory exists
    run_id = f"run_{int(time.time())}"
    output_dir = os.path.join(general_cfg["base_output_dir"], run_id)
    os.makedirs(output_dir, exist_ok=True)
    
    # Dump the active config for reproducibility/logging
    import json
    with open(os.path.join(output_dir, "config.json"), "w") as f:
        json.dump(final_cfg, f, indent=2)

    # 2. Load Data & Tokenizer
    print(f"[Train] Loading datasets for {task}...")
    train_ds, eval_ds, tokenizer = load_task_datasets(
        task=task,
        model_name=model_name,
        dataset_cfg=final_cfg["dataset"],
        train_samples=final_cfg["train_samples"],
        eval_samples=final_cfg["eval_samples"]
    )
    
    # 3. Load Model
    print(f"[Train] Loading model: {model_name}")
    ModelClass, peft_task_type = get_model_class(task)
    
    # Determine torch dtype
    torch_dtype = torch.float32
    if attn_cfg["dtype"] == "bf16" and torch.cuda.is_bf16_supported():
        torch_dtype = torch.bfloat16
    elif attn_cfg["dtype"] == "fp16":
        torch_dtype = torch.float16

    # Load Base Model
    model = ModelClass.from_pretrained(
        model_name,
        torch_dtype=torch_dtype,
        device_map=general_cfg["device"] if torch.cuda.is_available() else "cpu",
        trust_remote_code=True
    )

    # 4. Apply Attention Implementation (The Benchmark Core)
    model = apply_attention_implementation(model, attn_cfg["impl"])

    # 5. Apply LoRA (Parameter Efficient Fine-Tuning)
    # We use LoRA to make training faster and use less VRAM for benchmarks
    peft_config = LoraConfig(
        task_type=peft_task_type,
        inference_mode=False,
        r=8,
        lora_alpha=32,
        lora_dropout=0.1
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # 6. Data Collator
    if task == "summarization":
        data_collator = DataCollatorForSeq2Seq(tokenizer, model=model)
    elif task == "causal-lm":
        tokenizer.pad_token = tokenizer.eos_token
        data_collator = DataCollatorForLanguageModeling(tokenizer, mlm=False)
    else:
        data_collator = DataCollatorWithPadding(tokenizer)

    # 7. Training Arguments
    # Merge defaults from JSON with overrides
    args = TrainingArguments(
        output_dir=os.path.join(output_dir, "checkpoints"),
        overwrite_output_dir=True,
        num_train_epochs=training_cfg["num_train_epochs"],
        per_device_train_batch_size=training_cfg["per_device_train_batch_size"],
        gradient_accumulation_steps=training_cfg["gradient_accumulation_steps"],
        learning_rate=training_cfg["learning_rate"],
        logging_steps=training_cfg["logging_steps"],
        eval_steps=training_cfg["eval_steps"],
        save_steps=training_cfg["save_steps"],
        fp16=training_cfg["fp16"],
        bf16=training_cfg["bf16"] and torch.cuda.is_bf16_supported(),
        report_to=training_cfg["report_to"], # usually "none"
        disable_tqdm=False,
        eval_strategy="no" if eval_ds is None else "steps"
    )

    # 8. Initialize Trainer
    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        processing_class=tokenizer,
        data_collator=data_collator,
        callbacks=[CustomMonitorCallback(output_dir)]
    )

    # 9. Start Training
    print("[Train] Starting training loop...")
    start_time = time.time()
    train_result = trainer.train()
    total_time = time.time() - start_time
    
    print(f"[Train] Training complete in {total_time:.2f}s")

    # 10. Final Evaluation
    eval_metrics = {}
    if eval_ds:
        print("[Train] Running final evaluation...")
        eval_metrics = trainer.evaluate()

    # 11. Log Summary
    monitor_record = monitor_run(
        config=final_cfg,
        train_loss=train_result.training_loss,
        eval_loss=eval_metrics.get("eval_loss"),
        training_time=total_time,
        output_dir=output_dir
    )

    return {
        "train_loss": train_result.training_loss,
        "eval_metrics": eval_metrics,
        "monitor_record": monitor_record,
        "output_dir": output_dir
    }