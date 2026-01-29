"""
Main Training Script for LLM Fine-tuning with Memory Optimizations
===================================================================
Fine-tunes language models on various datasets using configurable preprocessing.

Requirements:
    - data_preprocessor.py (preprocessing module)
    - config_model.json (configuration file)
    - task_config.json (task templates)
    - helpers/ directory with utils.py and step_callback.py
"""

import os
import time
import math
import json
import shutil
import tempfile
import gc

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling
)
from datasets import load_dataset, Dataset
from helpers import utils
from helpers.step_callback import CustomMonitorCallback

# IMPORTANT: ensure the filename matches your preprocessor module
from data_preprocess import DatasetPreprocessor
from glob import glob

with open("myfile.txt", "w") as f:
    f.write("Hello! This file has been created.")


def clear_memory():
    """Clear GPU memory cache."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()


def neurocore():
    print("hello")

def main():

    # Memory optimization environment variables
    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
    clear_memory()

    """Main training pipeline with memory optimizations."""
    # ========================================================================
    # 1. LOAD CONFIGURATION
    # ========================================================================
    print("=" * 70)
    print("LOADING CONFIGURATION")
    print("=" * 70)
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
        config = json.load(f)

    # load task templates (must exist next to config_model.json)
    with open("task_config.json", "r") as f:
        task_config = json.load(f)

    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

    # Extract configuration sections
    general = config.get("general", {})
    dataset_cfg = config.get("dataset", {})
    training_cfg = config.get("training", {})
    paths = config.get("paths", {})
    hardware = config.get("hardware", {})

    print(f"✓ Configuration loaded successfully")
    print(f"  Model: {general.get('MODEL_NAME')}")
    print(f"  Dataset: {dataset_cfg.get('dataset_name')}")
    print(f"  Task: {dataset_cfg.get('task')}")

    # ========================================================================
    # 2. SETUP TEMPORARY MODEL DIRECTORY
    # ========================================================================
    print("\n" + "=" * 70)
    print("SETTING UP TEMPORARY STORAGE")
    print("=" * 70)

    output_dir = paths.get("output_dir", "./outputs")
    os.makedirs(output_dir, exist_ok=True)
    temp_model_dir = tempfile.mkdtemp(dir=output_dir)
    os.environ['HF_HUB_DISABLE_SYMLINKS_DCOR_SAFE'] = '1'
    print(f"✓ Temporary directory created: {temp_model_dir}")

    # ========================================================================
    # 3. DEVICE AND DTYPE CONFIGURATION
    # ========================================================================
    print("\n" + "=" * 70)
    print("HARDWARE CONFIGURATION")
    print("=" * 70)

    device = torch.device(hardware.get("device", "cpu") if torch.cuda.is_available() else "cpu")
    gpu_name = hardware.get("gpu_name", "Unknown")
    BF16_SUPPORTED = general.get("BF16_SUPPORTED", False)

    if device.type == "cuda":
        try:
            gpu_name = torch.cuda.get_device_name(0)
        except Exception:
            gpu_name = hardware.get("gpu_name", "Unknown")
        # detect bfloat16 support if possible
        try:
            BF16_SUPPORTED = torch.cuda.is_bf16_supported()
        except Exception:
            BF16_SUPPORTED = general.get("BF16_SUPPORTED", False)

        print(f"✓ Using device: {device}")
        print(f"  GPU Name: {gpu_name}")
        print(f"  BFloat16 Support: {BF16_SUPPORTED}")
        DTYPE = torch.bfloat16 if BF16_SUPPORTED else torch.float16
    else:
        print(f"✓ Using device: {device} (CPU mode)")
        print(f"  Data type: FP32")
        DTYPE = torch.float32

    # Clear memory before loading model
    clear_memory()

    # ========================================================================
    # 4. LOAD MODEL AND TOKENIZER
    # ========================================================================
    print("\n" + "=" * 70)
    print("LOADING MODEL AND TOKENIZER")
    print("=" * 70)

    MODEL_NAME = general.get("MODEL_NAME", "gpt2")
    print(f"Model: {MODEL_NAME}")
    print(f"Attention: {general.get('attn_implementation')}")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"✓ Tokenizer loaded")

    # Load model with memory optimizations
    model_load_kwargs = {
        "torch_dtype": DTYPE,
        "cache_dir": temp_model_dir,
        "low_cpu_mem_usage": True,  # Memory optimization
        "device_map": None  # Load to CPU first, then move to GPU
    }
    # optionally pass the attn implementation if provided
    if "attn_implementation" in general and general["attn_implementation"]:
        model_load_kwargs["attn_implementation"] = general["attn_implementation"]

    model = AutoModelForCausalLM.from_pretrained(MODEL_NAME, **model_load_kwargs)
    
    # Enable gradient checkpointing to save memory
    if hasattr(model, 'gradient_checkpointing_enable'):
        model.gradient_checkpointing_enable()
        print("✓ Gradient checkpointing enabled")
    
    model.to(device)
    
    try:
        param_count = sum(p.numel() for p in model.parameters())
    except Exception:
        param_count = getattr(model, "num_parameters", lambda: "unknown")()
    print(f"✓ Model loaded")
    print(f"  Parameters: {param_count:,}")

    # Clear memory after model loading
    clear_memory()

    # ========================================================================
    # 5. INITIALIZE DATA PREPROCESSOR (NEW API)
    # ========================================================================
    print("\n" + "=" * 70)
    print("INITIALIZING DATA PREPROCESSOR")
    print("=" * 70)

    # instantiate with the full config + task_config templates
    preprocessor = DatasetPreprocessor(
        full_config=config,
        task_config=task_config,
        tokenizer=tokenizer
    )

    # ========================================================================
    # 6. LOAD AND PREPROCESS DATASET
    # ========================================================================
    print("\n" + "=" * 70)
    print("LOADING AND PREPROCESSING DATASET")
    print("=" * 70)

    dataset_limit = general.get("dataset_limit", 1000)
    print(f"Dataset limit: {dataset_limit} samples")

    # Use the preprocessor to load the raw dataset
    raw_dataset = preprocessor.load_raw_dataset()

    # If dataset_limit > 0, select first N (works for in-memory datasets)
    if dataset_limit and dataset_limit > 0:
        try:
            # For Dataset objects
            raw_dataset = raw_dataset.select(range(min(len(raw_dataset), dataset_limit)))
        except Exception:
            # If dataset is an iterable/streaming, convert by taking items
            limited_items = []
            for i, ex in enumerate(raw_dataset):
                if i >= dataset_limit:
                    break
                limited_items.append(ex)
            raw_dataset = Dataset.from_list(limited_items)

    # Get preprocessing parameters
    MAX_INPUT_LEN = dataset_cfg.get("MAX_INPUT_LEN", 512)
    MAX_TARGET_LEN = dataset_cfg.get("MAX_TARGET_LEN", 128)
    padding_type = dataset_cfg.get("padding_type", "max_length")

    # Create preprocessing function (wrap to match HF map signature)
    def _preprocess_map(example):
        return preprocessor.preprocess_example(
            example,
            max_input_len=MAX_INPUT_LEN,
            max_target_len=MAX_TARGET_LEN,
            padding=padding_type
        )

    # Apply preprocessing. If preprocess returns None, those examples are dropped.
    print("Tokenizing & formatting dataset...")
    processed = raw_dataset.map(_preprocess_map, remove_columns=raw_dataset.column_names)

    # At this point, processed is a Dataset where each example contains tokenized fields (or is removed)
    # Remove any None-ish rows (HF map will drop returned None automatically, but this ensures safety)
    # Convert to list and back to Dataset to be safe and consistent
    print("Converting to in-memory list and filtering empty entries...")
    processed_list = [ex for ex in processed if ex and "input_ids" in ex and len(ex["input_ids"]) > 0]
    if len(processed_list) == 0:
        raise RuntimeError("No preprocessed dataset entries found. Check data, field mappings, and templates.")
    full_dataset = Dataset.from_list(processed_list)

    # Train/test split
    split_ratio = dataset_cfg.get("train_test_split_ratio", 0.1)
    train_test_split = full_dataset.train_test_split(test_size=split_ratio, seed=42)
    train_dataset = train_test_split["train"]
    eval_dataset = train_test_split["test"]

    print(f"✓ Dataset prepared")
    print(f"  Train samples: {len(train_dataset)}")
    print(f"  Eval samples: {len(eval_dataset)}")

    # Clear memory after dataset preparation
    clear_memory()

    # ========================================================================
    # 7. SETUP DATA COLLATOR
    # ========================================================================
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False
    )

    # ========================================================================
    # 8. CONFIGURE TRAINING ARGUMENTS WITH MEMORY OPTIMIZATIONS
    # ========================================================================
    print("\n" + "=" * 70)
    print("CONFIGURING TRAINING")
    print("=" * 70)

    # Reduce batch size if needed
    original_batch_size = training_cfg.get("per_device_train_batch_size", 4)
    # Reduce to 1 or 2 for large models
    adjusted_batch_size = min(original_batch_size, 2)
    
    # Increase gradient accumulation to compensate
    original_grad_accum = training_cfg.get("gradient_accumulation_steps", 1)
    # Calculate effective batch size
    effective_batch_size = original_batch_size * original_grad_accum
    adjusted_grad_accum = max(1, effective_batch_size // adjusted_batch_size)

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=training_cfg.get("num_train_epochs", 1),
        per_device_train_batch_size=adjusted_batch_size,  # Reduced
        per_device_eval_batch_size=1,  # Reduced for evaluation
        gradient_accumulation_steps=adjusted_grad_accum,  # Increased
        learning_rate=training_cfg.get("learning_rate", 5e-5),
        weight_decay=training_cfg.get("weight_decay", 0.0),
        logging_steps=training_cfg.get("logging_steps", 10),
        save_steps=training_cfg.get("save_steps", 500),
        fp16=training_cfg.get("fp16", False) and not BF16_SUPPORTED,
        bf16=BF16_SUPPORTED,
        eval_strategy=training_cfg.get("eval_strategy", "steps"),
        eval_steps=training_cfg.get("eval_steps", 100),
        report_to=training_cfg.get("report_to", "none"),
        save_total_limit=training_cfg.get("save_total_limit", 2),
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        # Memory optimization flags
        gradient_checkpointing=True,
        optim="adamw_torch_fused" if torch.cuda.is_available() else "adamw_torch",
        max_grad_norm=1.0,
        dataloader_pin_memory=False,  # Reduce memory pressure
    )

    print(f"✓ Training configuration:")
    print(f"  Epochs: {training_args.num_train_epochs}")
    print(f"  Batch size: {adjusted_batch_size} (adjusted from {original_batch_size})")
    print(f"  Gradient accumulation: {adjusted_grad_accum} (adjusted from {original_grad_accum})")
    print(f"  Effective batch size: {adjusted_batch_size * adjusted_grad_accum}")
    precision_str = "BF16" if BF16_SUPPORTED else ("FP16" if training_cfg.get("fp16", False) else "FP32")
    print(f"  Precision: {precision_str}")
    print(f"  Gradient checkpointing: Enabled")

    # ========================================================================
    # 9. INITIALIZE TRAINER
    # ========================================================================
    monitor_callback = CustomMonitorCallback(
        output_dir=training_cfg.get("metrics_output", "./metrics")
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        tokenizer=tokenizer,
        data_collator=data_collator,
        callbacks=[monitor_callback]
    )

    # Clear memory before training
    clear_memory()

    # ========================================================================
    # 10. FINE-TUNING
    # ========================================================================
    print("\n" + "=" * 70)
    print("STARTING FINE-TUNING")
    print("=" * 70)

    start_time = time.time()
    train_output = trainer.train()
    end_time = time.time()
    training_time = end_time - start_time

    # Trainer.train() returns a TrainOutput in HF >= 4. So handle fallback
    train_loss = getattr(train_output, "training_loss", None) or trainer.state.log_history[-1].get("loss", None)

    print(f"✓ Fine-tuning completed in {training_time:.2f}s")
    print(f"  Training loss: {train_loss:.4f}" if train_loss is not None else "  Training loss: unknown")

    # Clear memory after training
    clear_memory()

    # ========================================================================
    # 11. EVALUATION
    # ========================================================================
    print("\n" + "=" * 70)
    print("EVALUATING MODEL")
    print("=" * 70)

    eval_results = trainer.evaluate()
    eval_loss = eval_results.get("eval_loss", None)
    perplexity = math.exp(eval_loss) if eval_loss is not None and eval_loss < 100 else float("inf")

    print(f"✓ Evaluation complete")
    print(f"  Eval loss: {eval_loss:.4f}" if eval_loss is not None else "  Eval loss: unknown")
    print(f"  Perplexity: {perplexity:.2f}" if math.isfinite(perplexity) else "  Perplexity: inf")

    # ========================================================================
    # 12. SAVE MODEL
    # ========================================================================
    print("\n" + "=" * 70)
    print("SAVING MODEL")
    print("=" * 70)

    final_model_path = output_dir
    model.save_pretrained(final_model_path)
    tokenizer.save_pretrained(final_model_path)

    print(f"✓ Model saved to: {final_model_path}")

    # ========================================================================
    # 13. CLEANUP
    # ========================================================================
    print("\n" + "=" * 70)
    print("CLEANUP")
    print("=" * 70)

    try:
        shutil.rmtree(temp_model_dir)
        print(f"✓ Cleaned up temporary directory: {temp_model_dir}")
    except OSError as e:
        print(f"⚠ Warning: Could not clean up temporary directory: {e}")

    # Final memory cleanup
    clear_memory()

    # ========================================================================
    # 14. MONITOR RUN
    # ========================================================================
    print("\n" + "=" * 70)
    print("LOGGING RUN METRICS")
    print("=" * 70)

    utils.monitor_run(
        model_name=MODEL_NAME,
        dataset_name=dataset_cfg.get("dataset_name", ""),
        task=dataset_cfg.get("task", ""),
        dtype=str(DTYPE),
        seq_len=MAX_INPUT_LEN + MAX_TARGET_LEN,
        attention_type=general.get("attn_implementation", ""),
        fine_tune_method="standard",
        train_loss=train_loss,
        eval_loss=eval_loss,
        notes=f"Training time: {training_time:.2f}s, Perplexity: {perplexity:.2f}"
    )

    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 70)
    print("TRAINING SUMMARY")
    print("=" * 70)
    print(f"Model: {MODEL_NAME}")
    print(f"Dataset: {dataset_cfg.get('dataset_name')}")
    print(f"Task: {dataset_cfg.get('task')}")
    print(f"Training samples: {len(train_dataset)}")
    print(f"Eval samples: {len(eval_dataset)}")
    print(f"Training time: {training_time:.2f}s")
    print(f"Training loss: {train_loss:.4f}" if train_loss is not None else "Training loss: unknown")
    print(f"Eval loss: {eval_loss:.4f}" if eval_loss is not None else "Eval loss: unknown")
    print(f"Perplexity: {perplexity:.2f}" if math.isfinite(perplexity) else "Perplexity: inf")
    print(f"Model saved: {final_model_path}")
    print("=" * 70)
    print("✅ TRAINING PIPELINE COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    main()