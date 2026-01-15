from functools import partial
from typing import Tuple, Optional, Dict, Any

import datasets
from datasets import Dataset
from transformers import AutoTokenizer, PreTrainedTokenizerBase

from helpers.validation import validate_dataset
from helpers.preprocessors import (
    preprocess_summarization,
    preprocess_classification,
    preprocess_causal_lm,
)


def _stream_to_dataset(
    dataset_name: str,
    config_name: Optional[str],
    split: str,
    samples: int
) -> Dataset:
    """
    STREAMING:
    ia maxim `samples` elemente din split și le pune într-un Dataset in-memory.
    """
    stream = datasets.load_dataset(
        dataset_name,
        config_name,
        split=split,
        streaming=True
    )

    collected = []
    for i, item in enumerate(stream):
        if i >= samples:
            break
        collected.append(item)

    return Dataset.from_list(collected)


def build_tokenizer(model_name: str) -> PreTrainedTokenizerBase:
    """
    Load tokenizer + asigură-te că are pad_token.
    """
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token or tokenizer.unk_token
    return tokenizer


def load_task_datasets(
    task: str,
    model_name: str,
    dataset_cfg: Dict[str, Any],
    train_samples: int,
    eval_samples: int,
) -> Tuple[Dataset, Optional[Dataset], PreTrainedTokenizerBase]:
    """
    ENTRY POINT comun pentru toate task-urile:
    - validează datasetul (streaming, 1 sample)
    - încarcă train/eval cu streaming + sampling mic
    - aplică preprocessor în funcție de task
    """

    dataset_name = dataset_cfg["dataset_name"]
    config_name = dataset_cfg.get("config_name")
    input_column = dataset_cfg["input_column"]
    target_column = dataset_cfg.get("target_column")

    required_cols = [input_column]
    if target_column is not None:
        required_cols.append(target_column)

    # validate
    validate_dataset(dataset_name, config_name, required_cols)

    # tokenizer
    tokenizer = build_tokenizer(model_name)

    # streaming small slices
    print(f"[data_loader] Streaming train split ({train_samples} samples)...")
    train_ds = _stream_to_dataset(dataset_name, config_name, "train", train_samples)

    eval_ds = None
    for split in ("validation", "test"):
        try:
            print(f"[data_loader] Trying eval split '{split}'...")
            eval_ds = _stream_to_dataset(dataset_name, config_name, split, eval_samples)
            print(f"[data_loader] Using eval split '{split}'.")
            break
        except Exception:
            continue

    # choose preprocess function
    if task == "summarization":
        preprocess_fn = partial(
            preprocess_summarization,
            input_column=input_column,
            target_column=target_column,
            tokenizer=tokenizer,
            max_input_len=dataset_cfg["max_input_len"],
            max_target_len=dataset_cfg["max_target_len"],
        )
    elif task == "classification":
        preprocess_fn = partial(
            preprocess_classification,
            input_column=input_column,
            target_column=target_column,
            tokenizer=tokenizer,
            max_input_len=dataset_cfg["max_input_len"],
        )
    elif task == "causal-lm":
        preprocess_fn = partial(
            preprocess_causal_lm,
            input_column=input_column,
            tokenizer=tokenizer,
            max_input_len=dataset_cfg["max_input_len"],
        )
    else:
        raise ValueError(f"Unknown task '{task}'")

    # tokenize train
    print(f"[data_loader] Tokenizing train dataset for task '{task}'...")
    train_ds = train_ds.map(
        preprocess_fn,
        batched=True,
        remove_columns=train_ds.column_names
    )

    # tokenize eval if exists
    if eval_ds is not None:
        print(f"[data_loader] Tokenizing eval dataset for task '{task}'...")
        eval_ds = eval_ds.map(
            preprocess_fn,
            batched=True,
            remove_columns=eval_ds.column_names
        )

    return train_ds, eval_ds, tokenizer
