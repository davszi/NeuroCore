from transformers import TrainerCallback, TrainingArguments, TrainerState, TrainerControl

from Benchmarking.helpers.utils import monitor_step


class CustomMonitorCallback(TrainerCallback):
    """
    Callback HF Trainer care loghează metrici la fiecare logging_step.
    """

    def __init__(self, output_dir: str):
        super().__init__()
        self.output_dir = output_dir

    def on_log(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        logs=None,
        **kwargs
    ):
        if not logs or "loss" not in logs:
            return

        loss = logs["loss"]
        lr = logs.get("learning_rate")

        monitor_step(
            step=state.global_step,
            epoch=state.epoch or 0.0,
            loss=loss,
            learning_rate=lr,
            output_dir=self.output_dir
        )
