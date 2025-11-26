import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
from peft import LoraConfig, prepare_model_for_kbit_training, get_peft_model
from datasets import load_dataset
from trl import SFTTrainer  # versiunea veche a clasei

model_id = "Qwen/Qwen2.5-1.5B-Instruct"
dataset_id = "cnn_dailymail"
output_dir = "./qwen_15b_lora_fix"

# --- QLoRA config ---
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.float16,
)
print("using ", output_dir)
training_args = TrainingArguments(
    output_dir=output_dir,
    num_train_epochs=1,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=4,
    optim="paged_adamw_8bit",
    save_strategy="epoch",
    save_total_limit=1,
    logging_steps=10,
    learning_rate=2e-4,
    fp16=True,
    report_to="none",
)

# --- Dataset ---
def format_prompt(sample):
    return {"text": f"<s>[INST] Summarize:\n\n{sample['article']} [/INST] {sample['highlights']}</s>"}

dataset = load_dataset(dataset_id, "3.0.0", split="train[:1%]")
dataset = dataset.map(format_prompt, remove_columns=["article", "id", "highlights"])

# --- Model ---
print(f"Loading model {model_id} with QLoRA and SDPA attention...")

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    device_map="auto",
    dtype=torch.float16,
    attn_implementation="flash_attention_2",
    low_cpu_mem_usage=True,
)

# pregătește modelul pentru fine-tuning 4-bit
model = prepare_model_for_kbit_training(model)
model = get_peft_model(model, lora_config)
model.gradient_checkpointing_enable()
model.config.use_cache = False

tokenizer = AutoTokenizer.from_pretrained(model_id)
tokenizer.pad_token = tokenizer.eos_token

# --- Trainer (compatibil cu trl 0.25.0) ---
trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    peft_config=lora_config,
    processing_class=tokenizer,          # <- înlocuiește 'tokenizer'
    formatting_func=lambda s: s["text"], # <- înlocuiește 'dataset_text_field'
    args=training_args,
)

print(" Starting Fine-tuning...")
trainer.train()
print("\n Training complete! Model saved to:", output_dir)