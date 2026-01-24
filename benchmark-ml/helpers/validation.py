import datasets
from typing import List, Optional


def validate_dataset(
    dataset_name: str,
    config_name: Optional[str],
    required_columns: List[str]
) -> None:
    """
    Validate dataset + config + columns using streaming.
    DOAR citește primul sample din train, nu descarcă tot.
    """
    print(f"[validation] Validating dataset='{dataset_name}' (config={config_name})")
 
    # 1) validate config if multiple configs exist
    config_names = datasets.get_dataset_config_names(dataset_name)
    if config_name is not None and config_name not in config_names:
        raise ValueError(
            f"Config '{config_name}' not found for dataset '{dataset_name}'. "
            f"Available configs: {config_names}"
        )

    # 2) stream doar un singur exemplu
    stream = datasets.load_dataset(
        dataset_name,
        config_name,
        split="train",
        streaming=True
    )
    first = next(iter(stream))
    available_columns = list(first.keys())

    # 3) check required columns
    missing = [c for c in required_columns if c not in available_columns]
    if missing:
        raise ValueError(
            f"Missing required columns: {missing}. "
            f"Available columns: {available_columns}"
        )

    print("[validation] Dataset structure is valid.")
