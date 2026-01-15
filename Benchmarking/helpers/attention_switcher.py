# helpers/attention_switcher.py
import torch
from transformers import PreTrainedModel

WINDOW_SIZE = 64

def _apply_sequential_window_attention(model: PreTrainedModel) -> PreTrainedModel:
    def hook_forward(module, inputs, output):
        # output poate fi:
        # - Tensor
        # - tuple/list (attn_output, attn_weights, ...)
        # - ModelOutput / dict-like
        attn_output = None
        attn_weights = None

        # Case A: tuple/list
        if isinstance(output, (tuple, list)):
            if len(output) == 0:
                return output
            attn_output = output[0]
            if len(output) > 1:
                attn_weights = output[1]
            else:
                # nu avem weights -> nu avem ce masca
                return output

            # daca weights lipsesc / nu e Tensor
            if attn_weights is None or not torch.is_tensor(attn_weights):
                return output

            # aplica masca doar daca forma e compatibila
            window = min(WINDOW_SIZE, attn_weights.size(-1))
            mask = torch.full_like(attn_weights, -1e9)
            mask[..., -window:] = attn_weights[..., -window:]
            new_weights = torch.softmax(mask, dim=-1)

            # pastreaza restul elementelor din tuple
            out_list = list(output)
            out_list[0] = attn_output
            out_list[1] = new_weights
            return tuple(out_list)

        # Case B: tensor simplu -> nu avem weights
        return output

    for name, module in model.named_modules():
    # pune hook doar pe modulul attention "principal"
        if name.lower().endswith(".attention"):
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
