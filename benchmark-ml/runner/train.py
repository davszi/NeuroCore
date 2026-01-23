import math
import os
import time
import sys
from typing import Dict, Any

import torch
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoModelForSequenceClassification,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, TaskType
from peft.utils import prepare_model_for_kbit_training

# Allow imports from parent directories
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from helpers.data_loader import load_task_datasets
from helpers.attention_switcher import apply_attention_implementation
from helpers.step_callback import CustomMonitorCallback
from helpers.utils import monitor_run


# ---------------- MODEL CLASS SELECTOR -----------------
def _select_model_class(task: str):
    if task == "summarization":
        return AutoModelForSeq2SeqLM
    if task == "classification":
        return AutoModelForSequenceClassification
    if task == "causal-lm":
        return AutoModelForCausalLM
    raise ValueError(f"Unknown task '{task}'")


# ---------------- QLoRA CONFIG (4bit NF4) -----------------
def _setup_qlora_config(compute_dtype: torch.dtype, task: str) -> BitsAndBytesConfig:
    """
    Constructs BitsAndBytesConfig for QLoRA 4bit NF4.
    """
    if task == "classification":
        return None
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
    )


# ---------------- WRAP MODEL WITH QLoRA -----------------
def _wrap_with_qlora(model, task: str):
    """
    Attaches LoRA adapters over the 4bit model.
    """
    if task == "summarization":
        task_type = TaskType.SEQ_2_SEQ_LM
    elif task == "classification":
        task_type = TaskType.SEQ_CLS
    else:
        task_type = TaskType.CAUSAL_LM

    target_modules = None
    # Specific targeting for some architectures to improve performance
    model_type = getattr(getattr(model, "config", None), "model_type", "").lower()
    if model_type == "distilbert":
        target_modules = ["q_lin", "k_lin", "v_lin", "out_lin"]
    elif model_type == "albert":
        target_modules = ["query", "key", "value", "dense"]
            
    lora_cfg = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.1,
        bias="none",
        task_type=task_type,
        target_modules=target_modules,
    )

    model = get_peft_model(model, lora_cfg)
    
    # Ensure gradients are enabled where needed
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()

    model.print_trainable_parameters()

    return model, lora_cfg.to_dict()


# ---------------- MAIN TRAINING PIPELINE -----------------
def run_training(final_cfg: Dict[str, Any]) -> Dict[str, Any]:
    print("--- Starting Training Pipeline ---")
    
    # 1) Extract Config
    task         = final_cfg["task"]
    model_name   = final_cfg["model_name"]
    dataset_cfg  = final_cfg["dataset"]
    attention    = final_cfg["attention"]
    training_cfg = final_cfg["training"]
    general_cfg  = final_cfg["general"]
    attn_impl    = attention["impl"]

    # Device & DType
    compute_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    print(f"[train] Task: {task} | Model: {model_name}")
    print(f"[train] Attention: {attention['ui_choice']} ({attn_impl})")
    print(f"[train] Compute Dtype: {compute_dtype}")

    # 3) DATA LOADING
    train_ds, eval_ds, tokenizer = load_task_datasets(
        task=task,
        model_name=model_name,
        dataset_cfg=dataset_cfg,
        train_samples=final_cfg["train_samples"],
        eval_samples=final_cfg["eval_samples"],
    )

    num_labels = 6 if task == "classification" else None

    # 4) QLoRA CONFIGURATION
    bnb_config = _setup_qlora_config(compute_dtype, task)
    model_cls = _select_model_class(task)

    model_kwargs = {
        "cache_dir": general_cfg.get("cache_dir"),
        "dtype": compute_dtype,
    }

    if bnb_config is not None:
        print("[train] Loading model in 4-bit mode (QLoRA)...")
        model_kwargs["quantization_config"] = bnb_config

    if task == "classification":
        model_kwargs["device_map"] = {"": 0} 
    else:
        model_kwargs["device_map"] = "auto"

    if num_labels is not None:
        model_kwargs["num_labels"] = num_labels

    # 5) LOAD MODEL
    model = model_cls.from_pretrained(model_name, **model_kwargs)

    # 6) APPLY ATTENTION IMPLEMENTATION
    model = apply_attention_implementation(model, attn_impl)
    
    # 7) PREPARE FOR K-BIT TRAINING (BART FIX INCLUDED)
    model_type = getattr(getattr(model, "config", None), "model_type", "").lower()
    use_gc = True
    
    # BART summarization fails with standard gradient checkpointing in some versions
    if task == "summarization" and model_type == "bart":
        print("[train] Applying BART-specific stability fix...")
        use_gc = False
        model.config.use_cache = False
        if hasattr(model, "enable_input_require_grads"):
            model.enable_input_require_grads()
        else:
            emb = model.get_input_embeddings()
            if emb is not None:
                emb.weight.requires_grad_(True)

    if bnb_config is not None:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=use_gc)
        model, lora_info = _wrap_with_qlora(model, task)
    else:
        lora_info = None

    # Cleanup flags for safety
    for attr in ["is_loaded_in_4bit", "is_quantized"]:
        if hasattr(model, attr): setattr(model, attr, False)
        if hasattr(getattr(model, "base_model", None), attr): setattr(model.base_model, attr, False)    

    # 8) DATA COLLATOR
    data_collator = None
    if task == "causal-lm":
        data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    # 9) TRAINING ARGUMENTS & PATHS
    # CRITICAL: If Dashboard sent 'output_dir' (e.g. outputs/run_173999999), use it.
    if "output_dir" in general_cfg:
        output_dir = general_cfg["output_dir"]
    else:
        # Fallback for manual CLI runs
        base_output_dir = general_cfg.get("base_output_dir", "/tmp/nc_runs")
        run_name = f"{task}_{model_name.replace('/', '_')}_{attention['ui_choice']}"
        output_dir = os.path.join(base_output_dir, run_name)

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=training_cfg["num_train_epochs"],
        per_device_train_batch_size=training_cfg["per_device_train_batch_size"],
        gradient_accumulation_steps=training_cfg["gradient_accumulation_steps"],
        learning_rate=training_cfg["learning_rate"],
        weight_decay=training_cfg["weight_decay"],
        logging_steps=training_cfg["logging_steps"],
        save_steps=training_cfg["save_steps"],
        warmup_ratio=training_cfg["warmup_ratio"],
        fp16=False,
        bf16=False,
        save_strategy="no"
    )

    # 10) TRAINER + MONITORING
    # Use the same output_dir for monitoring logs so Dashboard can find them
    callback = CustomMonitorCallback(output_dir=output_dir)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,         
        data_collator=data_collator,
        callbacks=[callback],
    )

    # 11) TRAIN EXECUTION
    print(f"[train] Starting training loop -> Output: {output_dir}")
    t0 = time.time()
    train_output = trainer.train()
    training_time = time.time() - t0
    print(f"[train] Training done in {training_time:.2f} seconds.")

    train_loss = float(train_output.training_loss)

    # 12) EVALUATION
    eval_metrics: Dict[str, Any] = {}
    eval_loss = None
    if eval_ds is not None:
        print("[train] Evaluating...")
        eval_metrics = trainer.evaluate()
        eval_loss = eval_metrics.get("eval_loss")
        if eval_loss is not None and task in ("summarization", "causal-lm"):
            try: eval_metrics["perplexity"] = math.exp(eval_loss)
            except OverflowError: pass

    # 13) SAVE METRICS
    monitor_record = monitor_run(
        config=final_cfg,
        train_loss=train_loss,
        eval_loss=eval_loss,
        training_time=training_time,
        output_dir=output_dir,
    )

    return {
        "output_dir": output_dir,
        "train_loss": train_loss,
        "eval_metrics": eval_metrics,
        "monitor_record": monitor_record,
        "lora_info": lora_info,
    }