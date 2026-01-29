"""
Flexible Data Preprocessing Module for LLM Fine-tuning
=======================================================

Powered by:
✔ External config.json (dataset fields, task name, tokenizer)
✔ Task templates from task_config.json
✔ Fully dynamic: any dataset + any task
"""

import re
from typing import Dict, Optional, Tuple
from datasets import load_dataset


class DatasetPreprocessor:
    """
    Highly flexible preprocessor using:
    - External config.json (dataset settings)
    - External task_config.json (task templates)
    """

    def __init__(self, full_config: dict, task_config: dict, tokenizer):
        """
        Initialize with external configuration.

        Args:
            full_config: The entire config.json dictionary
            task_config: Task definitions from task_config.json
            tokenizer: HuggingFace tokenizer instance
        """
        self.cfg = full_config
        self.task_cfg_all = task_config
        self.tokenizer = tokenizer

        # dataset config
        self.dataset_cfg = full_config["dataset"]
        self.dataset_name = self.dataset_cfg["dataset_name"]
        self.dataset_version = self.dataset_cfg.get("version", None)
        self.dataset_split = self.dataset_cfg.get("dataset_split", "train")

        # task config
        self.task = self.dataset_cfg["task"]
        if self.task not in task_config:
            raise ValueError(f"Task '{self.task}' is not defined in task_config.json")
        self.task_cfg = task_config[self.task]

        print(f"✓ Preprocessor initialized for dataset='{self.dataset_name}' task='{self.task}'")

    # =====================================================================
    # CLEANING
    # =====================================================================
    def clean_text(self, text: str) -> str:
        """Standard text cleanup."""
        if not text:
            return ""

        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'@highlight', '', text)
        text = re.sub(r'@placeholder', '', text)
        text = re.sub(r'\s+([.,!?;:])', r'\1', text)

        return text.strip()

    # =====================================================================
    # EXTRACT FIELDS BASED ON DATASET CONFIG
    # =====================================================================
    def extract_fields(self, example: Dict) -> Dict[str, str]:
        """
        Generic field extraction using dataset config.
        Fully controlled by config.json.
        """
        fields = {}

        for f in self.task_cfg["fields"]:
            dataset_field = self.dataset_cfg.get(f"{f}_field", f)
            raw_value = example.get(dataset_field, "")

            # Some datasets use dict for answers (SQuAD)
            if isinstance(raw_value, dict) and "text" in raw_value:
                val = raw_value["text"][0] if raw_value["text"] else ""
            elif isinstance(raw_value, list):
                val = raw_value[0] if raw_value else ""
            else:
                val = str(raw_value)

            fields[f] = self.clean_text(val)

        return fields

    # =====================================================================
    # FORMAT USING TASK TEMPLATE
    # =====================================================================
    def format_input_output(self, fields: Dict[str, str]) -> Tuple[str, str]:
        """Fill input_template and output_template from task_config.json"""
        input_template = self.task_cfg["input_template"]
        output_template = self.task_cfg["output_template"]

        input_text = input_template.format(**fields)
        output_text = output_template.format(**fields)

        return input_text, output_text

    # =====================================================================
    # MAIN PREPROCESSING FUNCTION
    # =====================================================================
    def preprocess_example(
        self,
        example: Dict,
        max_input_len: int,
        max_target_len: int,
        padding: str = "max_length"
    ) -> Optional[Dict]:
        """
        Convert raw example → tokenized model input.
        """
        # Extract fields
        fields = self.extract_fields(example)

        # Build formatted input/output
        input_text, output_text = self.format_input_output(fields)

        # Skip empty examples
        if not input_text.strip() or not output_text.strip():
            return None

        # Combine text for causal LM
        full_text = f"{input_text} {self.tokenizer.eos_token} {output_text}"

        # Tokenize
        tokens = self.tokenizer(
            full_text,
            padding=padding,
            truncation=True,
            max_length=max_input_len + max_target_len
        )

        # Labels = input_ids for auto-regressive LM
        tokens["labels"] = tokens["input_ids"].copy()

        return tokens

    # =====================================================================
    # DATASET LOADING
    # =====================================================================
    def load_raw_dataset(self, streaming: bool = False):
        """
        Load dataset split automatically.
        Args:
            streaming: If True, uses streaming mode (saves disk for large datasets)
        """
        return load_dataset(
            path=self.dataset_name,
            name=self.dataset_version,
            split=self.dataset_split,
            streaming=True
        )

    def __repr__(self):
        return f"DatasetPreprocessor(dataset='{self.dataset_name}', task='{self.task}')"
