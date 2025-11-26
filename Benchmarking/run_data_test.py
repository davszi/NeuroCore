from helpers.data_loader import prepare_dataset
from helpers.preprocessors import preprocess_summarization
from transformers import AutoTokenizer
import json

config = json.load(open("config_model.json"))

tokenizer = AutoTokenizer.from_pretrained(config["general"]["MODEL_NAME"])
tokenizer.pad_token = tokenizer.eos_token

ds = prepare_dataset(
    dataset_name="cnn_dailymail",
    config_name="3.0.0",
    train_samples=5,
    eval_samples=2,
    required_columns=["article", "highlights"],
    preprocess_function=lambda batch: preprocess_summarization(
        batch=batch,
        input_column="article",
        target_column="highlights",
        tokenizer=tokenizer,
        seq_len=config["dataset"]["MAX_INPUT_LEN"] + config["dataset"]["MAX_TARGET_LEN"]
    )
)

print("OK! Data pipeline works.")
print(ds["train_dataset"][0])
