from helpers.utils import monitor_step
import psutil
from transformers import TrainerCallback, TrainingArguments, TrainerState, TrainerControl 
# -----------------------------------------------

class CustomMonitorCallback(TrainerCallback):
    """
    A custom callback to log system metrics and training loss using 
    the monitor_step function from helpers.utils.
    """
    def __init__(self, output_dir):
        # Pass the output directory to the callback
        self.output_dir = output_dir

    def on_log(self, args: TrainingArguments, state: TrainerState, control: TrainerControl, logs=None, **kwargs):
        """
        Called after logging happens (at each logging_steps interval).
        Logs the current step metrics.
        """
        if logs is not None and "loss" in logs:
            # logs["loss"] is the running average loss since last log
            current_loss = logs["loss"]
            current_lr = logs.get("learning_rate") 
            current_step = state.global_step
            current_epoch = state.epoch

            # Call your utility function
            monitor_step(
                step=current_step,
                epoch=current_epoch,
                loss=current_loss,
                output_dir=self.output_dir,
                learning_rate=current_lr
            )
        
        # If the trainer is logging evaluation metrics, you could also log them here 
        # using 'logs.get("eval_loss")' if desired.