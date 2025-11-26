import datasets
from typing import List, Union

def _validate_input(dataset_name: str, necessary_columns: Union[str, List[str]]):
    """
    Internal function to validate the existence of the dataset and columns.
    
    Args:
        dataset_name (str): The name of the dataset on the Hugging Face Hub.
        necessary_columns (Union[str, List[str]]): The column(s) required.
    
    Raises:
        ValueError: If the dataset is not found or if a column is missing.
    """
    
    if isinstance(necessary_columns, str):
        necessary_columns = [necessary_columns]
        
    # 1. Check if the dataset exists on the Hugging Face Hub
    try:
        # This checks the hub without downloading the full dataset immediately
        datasets.get_dataset_config_names(dataset_name)
    except datasets.exceptions.DatasetNotFoundError:
        raise ValueError(
            f"Dataset '{dataset_name}' not found on the Hugging Face Hub. Please check the spelling."
        )

    # 2. Check if the necessary columns exist
    try:
        # Load a small, single sample slice of the dataset to inspect column names
        # 'split' is often necessary; we assume 'train' exists for most fine-tuning datasets
        temp_data = datasets.load_dataset(dataset_name, split='train[:1]', keep_in_memory=False)
        available_columns = set(temp_data.column_names)
        
        missing_columns = [col for col in necessary_columns if col not in available_columns]

        if missing_columns:
            raise ValueError(
                f"The following required column(s) were not found in the dataset '{dataset_name}': "
                f"{missing_columns}. \n"
                f"Available columns are: {list(available_columns)}"
            )

    except Exception as e:
        # Catch other potential loading errors (e.g., no 'train' split)
        raise RuntimeError(f"An error occurred while inspecting the dataset '{dataset_name}': {e}")


def data_preprocessing(dataset_name: str, necessary_columns: Union[str, List[str]]) -> datasets.DatasetDict:
    """
    Loads a dataset from the Hugging Face Hub, validates it, removes unnecessary 
    columns, and returns the preprocessed data.
    
    Args:
        dataset_name (str): The name of the dataset on the Hugging Face Hub.
        necessary_columns (Union[str, List[str]]): A string or list of strings 
            representing the columns to keep.
            
    Returns:
        datasets.DatasetDict: The loaded and column-filtered dataset.
    """
    
    print(f"Starting validation for dataset: **{dataset_name}**")
    
    # Check if the arguments are valid (Call validation function)
    _validate_input(dataset_name, necessary_columns)
    
    print("Dataset found and all necessary columns exist.")

    # Standardize column input to a list
    if isinstance(necessary_columns, str):
        columns_to_keep = [necessary_columns]
    else:
        columns_to_keep = necessary_columns
        
    # --- Load Dataset ---
    print(f"Loading dataset: **{dataset_name}**")
    
    try:
        # Load the full dataset (will load all splits by default)
        raw_dataset = datasets.load_dataset(dataset_name)
    except Exception as e:
        raise RuntimeError(f"Failed to load the full dataset '{dataset_name}': {e}")

    # --- Remove Unnecessary Columns ---
    print(f"Filtering columns to keep only: {columns_to_keep}")
    
    def remove_unused_columns(data_dict: datasets.DatasetDict) -> datasets.DatasetDict:
        """Removes all columns that are NOT in the 'columns_to_keep' list for all splits."""
        for split_name in data_dict.keys():
            # Get columns to remove by finding the difference
            current_columns = data_dict[split_name].column_names
            columns_to_remove = [col for col in current_columns if col not in columns_to_keep]
            
            # Apply the removal
            data_dict[split_name] = data_dict[split_name].remove_columns(columns_to_remove)
            
        return data_dict

    preprocessed_dataset = remove_unused_columns(raw_dataset)

    # --- Return the processed dataset ---
    print("Preprocessing complete.")
    
    return preprocessed_dataset