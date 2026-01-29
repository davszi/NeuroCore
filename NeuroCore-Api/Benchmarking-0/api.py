import json
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from main import *
# Define the names of your configuration files
TEMPLATE_FILE = "config_model.json"
SUPP_DATASETS_FILE = "supp_datasets_conf.json"
from fastapi.middleware.cors import CORSMiddleware

# 1. Pydantic Model with Optional Fields
class TrainingInputConfig(BaseModel):
    # Fixed the redundant definition of num_train_epochs
    model_name: Optional[str] = Field(None, description="The base model name (e.g., openai-community/gpt2).")
    dataset_name: Optional[str] = Field(None, description="The HuggingFace dataset name (e.g., cnn_dailymail).")
    task: Optional[str] = Field(None, description="Task (e.g., summarization, question-answering).")
    attn_implementation: Optional[str] = Field(None, description="Attention mechanism.")
    
    dataset_limit: Optional[int] = Field(None, description="Max number of samples to load.")
    num_train_epochs: Optional[int] = Field(None, description="Number of training epochs.")


# --- Utility Function ---

def load_and_selectively_update_config(input_config: TrainingInputConfig, output_filename: str) -> Path:
    """
    Loads the JSON template, updates ONLY the fields provided in the input, 
    and importantly, merges dataset-specific configurations from the supplementary file.
    """
    template_path = Path(TEMPLATE_FILE)
    supp_config_path = Path(SUPP_DATASETS_FILE)

    # Validate file existence
    if not template_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Configuration template file not found: {TEMPLATE_FILE}"
        )
    if not supp_config_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Supplementary dataset configuration file not found: {SUPP_DATASETS_FILE}"
        )

    # Load the templates
    with open(template_path, 'r') as f:
        config_data: Dict[str, Any] = json.load(f)
        
    with open(supp_config_path, "r") as f:
        supp_datasets_conf: Dict[str, Any] = json.load(f)
        
    # Convert Pydantic model to a dictionary, excluding unset/None values
    input_updates = input_config.model_dump(exclude_none=True) 

    # 2. Selective Field Mapping and Dataset Merging
    try:
        
        # --- Dataset Merging Logic (Handles adding/overwriting dataset fields) ---
        if 'dataset_name' in input_updates:
            ds_name = input_updates['dataset_name']
            
            if ds_name in supp_datasets_conf:
                dataset_specific_conf = supp_datasets_conf[ds_name]
                
                # Merge ALL specific fields (e.g., article_field, context_field) 
                # from the supplementary config into the main config's dataset section.
                # Note: This overwrites any pre-existing fields in 'dataset' that are also in 'dataset_specific_conf'.
                config_data["dataset"].update(dataset_specific_conf)
                config_data["dataset"]["dataset_name"] = ds_name

                
            else:
                # If the dataset is provided but not in the supplementary file, 
                # we still update the name in the main config.
                config_data["dataset"]["dataset_name"] = ds_name
                # The dataset specific fields will remain their default values.

        # --- general section ---
        if 'model_name' in input_updates:
            config_data["general"]["MODEL_NAME"] = input_updates['model_name']
        if 'attn_implementation' in input_updates:
            config_data["general"]["attn_implementation"] = input_updates['attn_implementation']
        if 'dataset_limit' in input_updates:
            config_data["general"]["dataset_limit"] = input_updates['dataset_limit']

        # --- dataset section (Only applies if user explicitly provided 'task' in the request) ---
        if 'task' in input_updates:
            config_data["dataset"]["task"] = input_updates['task'] 
            
        # --- training section ---
        if 'num_train_epochs' in input_updates:
            config_data["training"]["num_train_epochs"] = input_updates['num_train_epochs']
            
        # --- paths section (Update output_dir if model_name was changed) ---
        if 'model_name' in input_updates or 'dataset_name' in input_updates:
            # Generate a new, safer output directory name based on updated config
            new_model_name_safe = config_data["general"]["MODEL_NAME"].split('/')[-1].replace('-', '_')
            new_dataset_name_safe = config_data["dataset"]["dataset_name"].replace('-', '_')
            config_data["paths"]["output_dir"] = f"{new_model_name_safe}_{new_dataset_name_safe}_output"

    except KeyError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error mapping input to template: Missing key {e} in template structure. Ensure {TEMPLATE_FILE} is correctly structured."
        )

    # 3. Save the modified configuration
    output_path = Path(output_filename)
    with open(output_path, "w") as f:
        json.dump(config_data, f, indent=4)
        
    return output_path

# --- FastAPI App ---

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.post("/save-config")
def save_config_file(config: TrainingInputConfig):
    """
    Receives configuration parameters, updates ONLY provided fields in the JSON template, 
    merges dataset-specific fields, and saves the new configuration file.
    
    Example input to test dataset merging:
    {"dataset_name": "xsum", "task": "summarization", "num_train_epochs": 2}
    """
    # Use a unique identifier to avoid overwriting the template or previous run
    input_updates = config.model_dump(exclude_none=True) 

    dataset_name=input_updates['dataset_name']
    output_filename = f"configuration/config_final.json"
    
    # Load, update, and save the configuration
    try:
        config_path = load_and_selectively_update_config(config, output_filename)
    except HTTPException as e:
        # Re-raise HTTPExceptions raised in the utility function
        raise e
    except Exception as e:
        # Catch other unexpected errors during file operation
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred during config processing: {e}"
        )
    
    return {
        "status": "Configuration file created successfully.",
        "config_file_path": str(config_path),
        "message": f"Template loaded, parameters updated, and saved to {output_filename}. Check the file contents to see the dataset fields merged."
    }

@app.get("/run")
def run_script():
    try:
        result = subprocess.run(
            ["python", "main.py"],
            capture_output=True,
            text=True
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {"error": str(e)}