# Benchmarking/runner/train.py
import math
import os
import time
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
from peft import LoraConfig, get_peft_model
from peft.utils import prepare_model_for_kbit_training

from Benchmarking.helpers.data_loader import load_task_datasets
from Benchmarking.helpers.attention_switcher import apply_attention_implementation
from Benchmarking.helpers.step_callback import CustomMonitorCallback
from Benchmarking.helpers.utils import monitor_run


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
    Construiește BitsAndBytesConfig pentru QLoRA 4bit NF4,
    cu dtype-ul de compute ales din attention.json.
    """
    if task == "classification":
        return None
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
    )


# ---------------- WRAP MODEL CU QLoRA -----------------
def _wrap_with_qlora(model, task: str) -> Dict[str, Any]:
    """
    Atașează adaptoare LoRA peste modelul 4bit.
    """

    if task == "summarization":
        task_type = "SEQ_2_SEQ_LM"
    elif task == "classification":
        task_type = "SEQ_CLS"
    else:
        task_type = "CAUSAL_LM"

    target_modules = None
    if task == "classification":
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
    model.print_trainable_parameters()

    return lora_cfg.to_dict()


# ---------------- MAIN TRAINING PIPELINE -----------------
def run_training(final_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pipeline complet:
      - load data (streaming + preprocess)
      - load model 4bit + LoRA
      - aplică attention impl (sdpa / flash / sequential)
      - train + eval
      - log metrice în JSONL (run + step)
    """

    # 1) Extragem config-ul unificat
    task         = final_cfg["task"]
    model_name   = final_cfg["model_name"]
    dataset_cfg  = final_cfg["dataset"]
    attention    = final_cfg["attention"]
    training_cfg = final_cfg["training"]
    general_cfg  = final_cfg["general"]

    attn_impl       = attention["impl"]

    # Device
    device_str = general_cfg.get("device", "cuda")
    device = torch.device(device_str if torch.cuda.is_available() else "cpu")

    print(f"[train] Task       = {task}")
    print(f"[train] Model      = {model_name}")
    print(f"[train] Attention  = {attention['ui_choice']} ({attn_impl})")
    print(f"[train] Device     = {device}")


    compute_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    print(f"[train] Using compute_dtype = {compute_dtype}")

    # 3) DATA
    train_ds, eval_ds, tokenizer = load_task_datasets(
        task=task,
        model_name=model_name,
        dataset_cfg=dataset_cfg,
        train_samples=final_cfg["train_samples"],
        eval_samples=final_cfg["eval_samples"],
    )

    num_labels = 6 if task == "classification" else None

    # 4) QLoRA quantization config
    bnb_config = _setup_qlora_config(compute_dtype, task)

    print("[train] Loading model 4bit…")
    model_cls = _select_model_class(task)

    model_kwargs = {
        "cache_dir": general_cfg.get("cache_dir"),
        "dtype": compute_dtype,
    }

    if bnb_config is not None:
        model_kwargs["quantization_config"] = bnb_config

    if task == "classification":
        model_kwargs["device_map"] = {"": 0}   # force everything on cuda:0
    else:
        model_kwargs["device_map"] = "auto"

    if num_labels is not None:
        model_kwargs["num_labels"] = num_labels

    model = model_cls.from_pretrained(
        model_name,
        **model_kwargs
    )

    # 1) Apply ATTENTION implementation (HOOKS, SDPA, Flash, etc.)
    model = apply_attention_implementation(model, attn_impl)

    # 2) Prepare for K-bit training
    print("[train] Preparing model for k-bit training…")
    model = prepare_model_for_kbit_training(model)

    model_type = getattr(getattr(model, "config", None), "model_type", "").lower()
    if task == "summarization" and model_type == "bart":
        # 1) checkpointing + cache incompatibile
        model.config.use_cache = False

        # 2) foarte important: asigură că intrările cer grad
        if hasattr(model, "enable_input_require_grads"):
            model.enable_input_require_grads()
        else:
            emb = model.get_input_embeddings()
            if emb is not None:
                emb.weight.requires_grad_(True)
        trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
        print("[debug] trainable params:", trainable_params)


    # 3) Apply LoRA adapters LAST
    print("[train] Applying QLoRA adapters…")
    lora_info = _wrap_with_qlora(model, task)

    for attr in ["is_loaded_in_4bit", "is_quantized"]:
        if hasattr(model, attr):
            setattr(model, attr, False)
        if hasattr(getattr(model, "base_model", None), attr):
            setattr(model.base_model, attr, False)    

    # 8) DATA COLLATOR (doar pentru causal-lm)
    data_collator = None
    if task == "causal-lm":
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=tokenizer,
            mlm=False,
        )

    # 9) TRAINING ARGUMENTS (safe subset pt versiunea ta de transformers)
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

    # 10) TRAINER + CALLBACK DE MONITORIZARE
    monitor_dir = training_cfg.get("monitor_output_dir", "monitor_results")
    callback = CustomMonitorCallback(output_dir=monitor_dir)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,         
        data_collator=data_collator,
        callbacks=[callback],
    )

    # 11) TRAIN
    print("[train] Starting training…")
    t0 = time.time()
    train_output = trainer.train()
    t1 = time.time()
    training_time = t1 - t0
    print(f"[train] Training done in {training_time:.2f} seconds.")

    train_loss = float(train_output.training_loss)

    # 12) EVAL (la final, nu în timpul training-ului)
    eval_metrics: Dict[str, Any] = {}
    eval_loss = None
    if eval_ds is not None:
        print("[train] Evaluating…")
        eval_metrics = trainer.evaluate()
        eval_loss = eval_metrics.get("eval_loss")

        if eval_loss is not None and task in ("summarization", "causal-lm"):
            try:
                eval_metrics["perplexity"] = math.exp(eval_loss)
            except OverflowError:
                pass

    # 14) MONITOR FINAL RUN
    monitor_record = monitor_run(
        config=final_cfg,
        train_loss=train_loss,
        eval_loss=eval_loss,
        training_time=training_time,
        output_dir=monitor_dir,
    )

    return {
        "output_dir": output_dir,
        "train_loss": train_loss,
        "eval_metrics": eval_metrics,
        "monitor_record": monitor_record,
        "lora_info": lora_info,
    }
