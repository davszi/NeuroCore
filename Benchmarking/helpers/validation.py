import datasets
from typing import Dict, List, Any, Optional, Callable
from transformers import AutoTokenizer
from functools import partial

def validate_dataset(dataset_name: str, config_name: str, required_columns: List[str]):
    """
    Internal function to validate dataset name, config, and columns 
    WITHOUT downloading the full dataset (streaming-safe).
    """
    print("Starting validation...")

    # 1) Validate config
    config_names = datasets.get_dataset_config_names(dataset_name)
    if config_name and config_name not in config_names:
        raise ValueError(
            f"Configuration '{config_name}' not found for dataset '{dataset_name}'. "
            f"Available configs: {config_names}"
        )

    # 2) STREAM ONLY FIRST SAMPLE
    stream = datasets.load_dataset(
        dataset_name,
        config_name,
        split="train",
        streaming=True
    )

    first = next(iter(stream))  # only one item, no disk loading
    available_columns = list(first.keys())

    # 3) Validate required columns
    missing_columns = [col for col in required_columns if col not in available_columns]

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}\n"
            f"Available columns: {available_columns}"
        )

    print("Dataset, configuration, and columns are valid!")
