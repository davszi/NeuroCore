from typing import Dict, Any, List
from transformers import AutoTokenizer

# ===========================================================
# SUMMARIZATION PREPROCESSOR (GPT-2 CLM STYLE)
# ===========================================================

def preprocess_summarization(
    batch: Dict[str, Any],
    input_column: str,
    target_column: str,
    tokenizer: AutoTokenizer,
    seq_len: int
) -> Dict[str, List[int]]:

    prompt_texts = [
        f"Summarize the following text:\n{inp}\n\nSummary:"
        for inp in batch[input_column]
    ]

    full_texts = [
        p + " " + tgt
        for p, tgt in zip(prompt_texts, batch[target_column])
    ]

    tokens = tokenizer(
        full_texts,
        truncation=True,
        padding="max_length",
        max_length=seq_len,
    )

    tokens["labels"] = tokens["input_ids"].copy()
    return tokens


# ===========================================================
# CLASSIFICATION PREPROCESSOR
# ===========================================================

def preprocess_classification(
    batch: Dict[str, Any],
    input_column: str,
    target_column: str,
    tokenizer: AutoTokenizer,
    seq_len: int
) -> Dict[str, Any]:

    tokens = tokenizer(
        batch[input_column],
        truncation=True,
        padding="max_length",
        max_length=seq_len,
    )

    tokens["labels"] = batch[target_column]
    return tokens
