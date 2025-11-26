import os
import time
import torch
import math
import json
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling
)
from datasets import load_dataset, Dataset
from helpers import utils
import tempfile
import shutil

from helpers.step_callback import CustomMonitorCallback

# --- Load configuration JSON ---
with open("config_model.json", "r") as f:
    config = json.load(f)

# --- Extract sections ---
general = config["general"]
dataset_cfg = config["dataset"]
training_cfg = config["training"]
paths = config["paths"]
hardware = config["hardware"]

# ----------------------------------------------------
# 1. TEMPORARY DIRECTORY FOR MODEL (Bypassing Cache)
# ----------------------------------------------------
# Create a temporary directory in a known safe location (like /scratch)
# The model will be downloaded and loaded from here, then deleted later.
# You must ensure the chosen directory (tempdir) has enough space.
temp_model_dir = tempfile.mkdtemp(dir=paths["output_dir"]) # Use output_dir's parent/location as temp root

# --- Disable caching and set environment to load from temp path ---
# This environment variable tells Hugging Face Hub not to store files
# in the main cache and use the temporary download location directly.
os.environ['HF_HUB_DISABLE_SYMLINKS_DCOR_SAFE'] = '1'

# --- 2. Device and BF16 Check ---
device = torch.device(hardware["device"] if torch.cuda.is_available() else "cpu")
# ... (rest of the hardware checks remain the same) ...
gpu_name = hardware["gpu_name"]
BF16_SUPPORTED = general["BF16_SUPPORTED"]

if device.type == "cuda":
    gpu_name = torch.cuda.get_device_name(0)
    BF16_SUPPORTED = torch.cuda.is_bf16_supported()
    print(f"Using device: {device}")
    print(f"GPU Name: {gpu_name}")
    print(f"BFloat16 Support: {BF16_SUPPORTED}")
    DTYPE = torch.bfloat16 if BF16_SUPPORTED else torch.float16
else:
    print(f"Using device: {device}. Using standard FP32 data type.")
    DTYPE = torch.float32

# --- 3. Load GPT-2 from Temporary Download ---
MODEL_NAME = general["MODEL_NAME"]
print(f"Loading model: {MODEL_NAME} with PyTorch SDPA...")

# Tokenizer still uses standard cache but is small
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Pass the temporary directory to 'cache_dir'. Since we set the environment variable
# above, this path will be used directly without symlinking/copying to HF_HOME.
model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    attn_implementation=general["attn_implementation"],
    torch_dtype=DTYPE,
    cache_dir=temp_model_dir  # Use the temp directory for the download
)
model.to(device)
print(f"Model downloaded and loaded from temporary directory: {temp_model_dir}")

# ----------------------------------------------------
# ... (Steps 4 through 9: Dataset, Collator, Training Arguments, Trainer, Fine-tuning) ...
# ----------------------------------------------------
# --- 4. Dataset ---
# NOTE: The dataset will still use Hugging Face's dataset cache.
# To avoid dataset caching, you would need to load data locally or use an iterable dataset
# without saving to disk. Since your original script uses streaming and then takes a limit,
# and converts it to a list, the streaming part is efficient, but the list conversion
# and Dataset.from_list still loads it all into memory/temp disk space.
# We will leave this section as-is for training functionality.

dataset_limit = general["dataset_limit"]
dataset = load_dataset(
    dataset_cfg["dataset_name"],
    dataset_cfg["dataset_config"],
    split=dataset_cfg["dataset_split"],
    streaming=True
)
dataset = dataset.take(dataset_limit)

MAX_INPUT_LEN = dataset_cfg["MAX_INPUT_LEN"]
MAX_TARGET_LEN = dataset_cfg["MAX_TARGET_LEN"]

def preprocess(example):
    article = example[dataset_cfg["article_field"]]
    summary = example[dataset_cfg["summary_field"]]
    text = article + " " + tokenizer.eos_token + " " + summary
    tokens = tokenizer(
        text,
        max_length=MAX_INPUT_LEN + MAX_TARGET_LEN,
        truncation=True,
        padding=dataset_cfg["padding_type"]
    )
    tokens["labels"] = tokens["input_ids"].copy()
    return tokens

tokenized_dataset = dataset.map(preprocess)

data_list = list(tokenized_dataset)
full_dataset = Dataset.from_list(data_list)
train_test_split = full_dataset.train_test_split(
    test_size=dataset_cfg["train_test_split_ratio"], seed=42
)
train_dataset = train_test_split["train"]
eval_dataset = train_test_split["test"]

print(f"Train samples: {len(train_dataset)}, Eval samples: {len(eval_dataset)}")

# --- 6. Data Collator ---
data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

# --- 7. Training Arguments ---
training_args = TrainingArguments(
    output_dir=paths["output_dir"],
    num_train_epochs=training_cfg["num_train_epochs"],
    per_device_train_batch_size=training_cfg["per_device_train_batch_size"],
    gradient_accumulation_steps=training_cfg["gradient_accumulation_steps"],
    learning_rate=training_cfg["learning_rate"],
    weight_decay=training_cfg["weight_decay"],
    logging_steps=training_cfg["logging_steps"],
    save_steps=training_cfg["save_steps"],
    fp16=training_cfg["fp16"],
    bf16=BF16_SUPPORTED,
    eval_strategy=training_cfg["eval_strategy"],
    report_to=training_cfg["report_to"],
)

monitor_callback = CustomMonitorCallback(output_dir=config["training"]["metrics_output"])

# --- 8. Trainer ---
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    tokenizer=tokenizer,
    data_collator=data_collator,
    callbacks=[monitor_callback]
)

# --- 9. Fine-tuning ---
print("\n--- Starting Fine-tuning ---")
start_time = time.time()
train_output = trainer.train()
end_time = time.time()
training_time = end_time - start_time
print(f"Fine-tuning finished in {training_time:.2f}s")

train_loss = train_output.training_loss

# --- 10. Evaluation ---
print("\n--- Starting Evaluation ---")
eval_results = trainer.evaluate()
loss = eval_results.get("eval_loss")
perplexity = math.exp(loss) if loss is not None else float("inf")
print(f"Perplexity: {perplexity:.2f}")

# --- 11. Save Model ---
model.save_pretrained(paths["output_dir"])
tokenizer.save_pretrained(paths["output_dir"])
print(f"Model saved at {paths['output_dir']}")

# --- 12. Cleanup (Crucial for a non-caching approach) ---
try:
    shutil.rmtree(temp_model_dir)
    print(f"Cleaned up temporary model directory: {temp_model_dir}")
except OSError as e:
    print(f"Error during cleanup of temporary model directory: {e}")

# --- 13. Monitor Run ---
utils.monitor_run(
    model_name=MODEL_NAME,
    dataset_name=dataset_cfg["dataset_name"],
    task="summarization",
    dtype=str(DTYPE),
    seq_len=MAX_INPUT_LEN + MAX_TARGET_LEN,
    attention_type=general["attn_implementation"],
    fine_tune_method="standard",
    train_loss=train_loss,
    eval_loss = loss,
    notes=f"Training time: {training_time:.2f}s"
)