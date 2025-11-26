import torch, time, gc
from datasets import load_dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling,
)

# ========== SETTINGS ==========
MODEL_NAME = "gpt2"
SEQ_LEN = 512                
TRAIN_SAMPLES = 10000
EVAL_SAMPLES = 2000
OUTPUT_DIR = "./finetuned_gpt2_summarization"
# ==============================

# --- Detect safe precision ---
use_bf16 = "bf16"
precision = "bf16"
print(f"Using precision: {precision}")

# --- Load dataset (CNN/DailyMail) ---
dataset = load_dataset("cnn_dailymail", "3.0.0")
train_dataset = dataset["train"].select(range(TRAIN_SAMPLES))
eval_dataset  = dataset["validation"].select(range(EVAL_SAMPLES))

# --- Tokenizer ---
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token

# --- Preprocessing function ---
def preprocess(batch):
    """Concatenate article + TL;DR: + summary so GPT-2 learns to generate summaries."""
    prompt_texts = [
        "Summarize the following article:\n" + article + "\n\nTL;DR:"
        for article in batch["article"]
    ]
    full_texts = [
        p + " " + summary for p, summary in zip(prompt_texts, batch["highlights"])
    ]
    tokens = tokenizer(
        full_texts,
        truncation=True,
        padding="max_length",
        max_length=SEQ_LEN,
    )
    return tokens

train_dataset = train_dataset.map(preprocess, batched=True, remove_columns=dataset["train"].column_names)
eval_dataset  = eval_dataset.map(preprocess,  batched=True, remove_columns=dataset["validation"].column_names)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    torch_dtype=torch.bfloat16,
)
model.resize_token_embeddings(len(tokenizer))

# --- Data collator ---
collator = DataCollatorForLanguageModeling(tokenizer, mlm=False)

# --- Training arguments ---
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    overwrite_output_dir=True,
    num_train_epochs=3,
    per_device_train_batch_size=2,
    per_device_eval_batch_size=2,
    logging_steps=10,
    eval_strategy="epoch",
    save_strategy="no",
    bf16=use_bf16,
    fp16=False,
    report_to=[],
)

# --- Benchmark training ---
device = "cuda" if torch.cuda.is_available() else "cpu"
gc.collect()
if device == "cuda":
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()

print("Starting GPT-2 summarization fine-tuning benchmark...\n")
start_time = time.time()

trainer = Trainer(
    model=model,
    args=training_args,
    data_collator=collator,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
)

train_result = trainer.train()

if device == "cuda":
    torch.cuda.synchronize()
runtime = time.time() - start_time
mem_used_gb = torch.cuda.max_memory_allocated() / 1e9 if device == "cuda" else 0

print("\nSummarization training benchmark completed:")
print(f"   Runtime: {runtime:.2f} sec")
print(f"   Peak GPU memory: {mem_used_gb:.2f} GB")
print(f"   Final loss: {train_result.training_loss:.4f}")

# --- Save fine-tuned model ---
trainer.save_model(OUTPUT_DIR)
print(f"\nModel saved to {OUTPUT_DIR}")
