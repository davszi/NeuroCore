from typing import Dict, Any, List
from transformers import PreTrainedTokenizerBase


# =========================
# 1) SUMMARIZATION (seq2seq)
# =========================

def preprocess_summarization(
    batch: Dict[str, Any],
    input_column: str,
    target_column: str,
    tokenizer: PreTrainedTokenizerBase,
    max_input_len: int,
    max_target_len: int
) -> Dict[str, List[int]]:
    """
    Preprocessor pentru T5 / BART:
    - encoder primește article
    - decoder primește highlight
    """
    inputs = batch[input_column]
    targets = batch[target_column]

    model_inputs = tokenizer(
        inputs,
        max_length=max_input_len,
        truncation=True,
        padding="max_length"
    )

    with tokenizer.as_target_tokenizer():
        labels = tokenizer(
            targets,
            max_length=max_target_len,
            truncation=True,
            padding="max_length"
        )["input_ids"]

    model_inputs["labels"] = labels
    return model_inputs


# =========================
# 2) CLASSIFICATION
# =========================

def preprocess_classification(
    batch: Dict[str, Any],
    input_column: str,
    target_column: str,
    tokenizer: PreTrainedTokenizerBase,
    max_input_len: int
) -> Dict[str, Any]:
    """
    Preprocessor pentru emotion classification.
    """
    tokens = tokenizer(
        batch[input_column],
        max_length=max_input_len,
        truncation=True,
        padding="max_length"
    )
    tokens["labels"] = batch[target_column]
    return tokens


# =========================
# 3) CAUSAL LM
# =========================

def preprocess_causal_lm(
    batch: Dict[str, Any],
    input_column: str,
    tokenizer: PreTrainedTokenizerBase,
    max_input_len: int
) -> Dict[str, Any]:
    """
    Preprocessor pentru GPT-2 / Qwen causal LM.
    """
    texts = batch[input_column]
    tokens = tokenizer(
        texts,
        max_length=max_input_len,
        truncation=True,
        padding="max_length"
    )
    tokens["labels"] = tokens["input_ids"].copy()
    return tokens
