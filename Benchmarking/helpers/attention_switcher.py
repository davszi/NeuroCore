# helpers/attention_switcher.py
import torch
from transformers import PreTrainedModel

WINDOW_SIZE = 64

def _apply_sequential_window_attention(model: PreTrainedModel) -> PreTrainedModel:
    def hook_forward(module, input, output):
        if not isinstance(output, tuple):
            return output
        attn_output, attn_weights = output
        if attn_weights is None:
            return output
        window = min(WINDOW_SIZE, attn_weights.size(-1))
        mask = torch.full_like(attn_weights, -1e9)
        mask[..., -window:] = attn_weights[..., -window:]
        attn_weights = torch.softmax(mask, dim=-1)
        return attn_output, attn_weights

    for name, module in model.named_modules():
        if "attention" in name.lower():
            try:
                module.register_forward_hook(hook_forward)
                print(f"[attention] Hook added → {name}")
            except Exception:
                pass

    return model


def apply_attention_implementation(model: PreTrainedModel, attn_impl: str) -> PreTrainedModel:
    if attn_impl in ("scaled_dot_product_attention", "flash_attention_2"):
        if hasattr(model.config, "attn_implementation"):
            model.config.attn_implementation = attn_impl
        print(f"[attention] Using native '{attn_impl}'")

    elif attn_impl == "sequential_window":
        print("[attention] Using CUSTOM Sequential Window Attention")
        model = _apply_sequential_window_attention(model)

    else:
        print(f"[attention] Unknown impl '{attn_impl}'")

    return model
