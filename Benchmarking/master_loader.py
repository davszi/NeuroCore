from functools import partial
from transformers import AutoTokenizer

from helpers.data_loader import prepare_dataset
from helpers.preprocessors import (
    preprocess_summarization,
    preprocess_classification
)

TASK_REGISTRY = {
    "summarization": preprocess_summarization,
    "classification": preprocess_classification
}

def load_data_pipeline(
    task: str,
    dataset_name: str,
    config_name: str,
    input_column: str,
    target_column: str,
    seq_len: int,
    tokenizer_name: str,
    train_samples: int,
    eval_samples: int,
):

    if task not in TASK_REGISTRY:
        raise ValueError(f"Unknown task '{task}'. Supported: {list(TASK_REGISTRY)}")

    tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
    tokenizer.pad_token = tokenizer.eos_token

    preprocess_fn = partial(
        TASK_REGISTRY[task],
        input_column=input_column,
        target_column=target_column,
        tokenizer=tokenizer,
        seq_len=seq_len
    )

    required_cols = [input_column, target_column]

    ds = prepare_dataset(
        dataset_name=dataset_name,
        config_name=config_name,
        train_samples=train_samples,
        eval_samples=eval_samples,
        required_columns=required_cols,
        preprocess_function=preprocess_fn
    )

    return ds["train_dataset"], ds["eval_dataset"], tokenizer
