import datasets
from typing import Dict, List, Any, Optional, Callable
from helpers.validation import validate_dataset

def prepare_dataset(
    dataset_name: str,
    config_name: Optional[str],
    train_samples: int,
    eval_samples: int,
    required_columns: List[str],
    preprocess_function: Callable,
) -> Dict[str, datasets.Dataset]:

    # Validate config + columns using streaming
    validate_dataset(dataset_name, config_name, required_columns)

    print(f"\nLoading SMALL dataset slice from: {dataset_name} (streaming mode)")

    # ---- TRAIN STREAM ----
    train_stream = datasets.load_dataset(
        dataset_name,
        config_name,
        split="train",
        streaming=True
    )

    train_list = []
    for i, item in enumerate(train_stream):
        if i >= train_samples:
            break
        train_list.append(item)

    train_dataset = datasets.Dataset.from_list(train_list)

    # ---- EVAL: try validation → else try test ----
    eval_dataset = None

    for possible_split in ["validation", "test"]:
        try:
            eval_stream = datasets.load_dataset(
                dataset_name,
                config_name,
                split=possible_split,
                streaming=True
            )
            eval_list = []
            for i, item in enumerate(eval_stream):
                if i >= eval_samples:
                    break
                eval_list.append(item)

            eval_dataset = datasets.Dataset.from_list(eval_list)
            print(f"Eval split used: {possible_split}")
            break

        except Exception:
            continue

    if eval_dataset is None:
        print("⚠ No evaluation split found!")
    
    # ---- Preprocess ----
    print("Tokenizing using custom preprocess function...")

    train_dataset = train_dataset.map(
        preprocess_function,
        batched=True,
        remove_columns=train_dataset.column_names
    )

    if eval_dataset:
        eval_dataset = eval_dataset.map(
            preprocess_function,
            batched=True,
            remove_columns=eval_dataset.column_names
        )

    return {
        "train_dataset": train_dataset,
        "eval_dataset": eval_dataset
    }


# import datasets
# from typing import Dict, List, Any, Optional, Callable
# from helpers.validation import validate_dataset

# def prepare_dataset(
#     dataset_name: str,
#     config_name: Optional[str],
#     train_samples: int,
#     eval_samples: int,
#     required_columns: List[str],
#     preprocess_function: Callable,
# ) -> Dict[str, datasets.Dataset]:

#     # Validate only first sample (streaming-safe)
#     validate_dataset(dataset_name, config_name, required_columns)

#     print(f"\nLoading SMALL dataset slice from: {dataset_name} (streaming mode)")

#     # ---- TRAIN STREAM ----
#     train_stream = datasets.load_dataset(
#         dataset_name,
#         config_name,
#         split="train",
#         streaming=True
#     )
#     train_list = []

#     for i, item in enumerate(train_stream):
#         if i >= train_samples:
#             break
#         train_list.append(item)

#     train_dataset = datasets.Dataset.from_list(train_list)

#     # ---- EVAL STREAM ----
#     split_names = datasets.get_dataset_split_names(dataset_name, config_name)
#     eval_split = "validation" if "validation" in split_names else "test"

#     eval_dataset = None

#     if eval_split:
#         eval_stream = datasets.load_dataset(
#             dataset_name,
#             config_name,
#             split=eval_split,
#             streaming=True
#         )
#         eval_list = []
#         for i, item in enumerate(eval_stream):
#             if i >= eval_samples:
#                 break
#             eval_list.append(item)

#         eval_dataset = datasets.Dataset.from_list(eval_list)
#         print(f"Eval split: {eval_split}")

#     # ---- Preprocess ----
#     print("Tokenizing using custom preprocess function...")

#     train_dataset = train_dataset.map(
#         preprocess_function,
#         batched=True,
#         remove_columns=train_dataset.column_names
#     )

#     if eval_dataset:
#         eval_dataset = eval_dataset.map(
#             preprocess_function,
#             batched=True,
#             remove_columns=eval_dataset.column_names
#         )

#     return {
#         "train_dataset": train_dataset,
#         "eval_dataset": eval_dataset
#     }
