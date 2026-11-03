#!/usr/bin/env python3
"""Synthetic CPU checks of the article's row selector and linear projection.

The selector expression is source-derived from Transformers v5.12.1, but this
script does not import Transformers or load a model. It checks small PyTorch
tensors only: no backbone, cache, labels/loss, timing, or memory claim is tested.
"""

import json
import platform

import torch
import torch.nn.functional as F


def select_and_project(hidden, weight, keep):
    index = slice(-keep, None) if isinstance(keep, int) else keep
    selected = hidden[:, index, :]
    return selected, F.linear(selected, weight)


def main():
    torch.set_num_threads(1)
    checks = []
    observed = {}

    def check(name, passed):
        checks.append({"name": name, "passed": bool(passed)})

    def expect_error(name, operation, expected_type):
        try:
            operation()
        except Exception as error:
            observed[name] = {"error_type": type(error).__name__}
            check(name, isinstance(error, expected_type))
        else:
            observed[name] = {"error_type": None}
            check(name, False)

    b, length, hidden_size, vocab = 2, 6, 4, 10
    hidden = torch.arange(b * length * hidden_size, dtype=torch.float32,
                          device="cpu").reshape(b, length, hidden_size)
    weight = torch.zeros((vocab, hidden_size), dtype=torch.float32, device="cpu")
    hidden_before, weight_before = hidden.clone(), weight.clone()
    choices = [
        ("integer_0", 0, [0, 1, 2, 3, 4, 5]),
        ("last_2", 2, [4, 5]),
        ("empty_tensor", torch.empty(0, dtype=torch.long, device="cpu"), []),
        ("rows_1_4", torch.tensor([1, 4], dtype=torch.long, device="cpu"), [1, 4]),
    ]
    selected_rows = {}
    observed["article_cases"] = []
    original_rows = hidden.tolist()
    for name, keep, expected_rows in choices:
        selected, logits = select_and_project(hidden, weight, keep)
        expected_values = [[batch[row] for row in expected_rows]
                           for batch in original_rows]
        selected_rows[name] = selected
        observed["article_cases"].append({
            "name": name,
            "expected_rows": expected_rows,
            "hidden_shape": list(selected.shape),
            "logits_shape": list(logits.shape),
            "selected_first_feature": selected[:, :, 0].tolist(),
            "logits_elements": logits.numel(),
        })
        check(name + ".shapes", list(selected.shape) == [b, len(expected_rows), hidden_size]
              and list(logits.shape) == [b, len(expected_rows), vocab])
        check(name + ".row_values", selected.tolist() == expected_values)
        check(name + ".zero_weight_projection", bool(logits.eq(0).all()))

    check("same_shape_does_not_mean_same_rows",
          selected_rows["last_2"].shape == selected_rows["rows_1_4"].shape
          and not torch.equal(selected_rows["last_2"], selected_rows["rows_1_4"]))

    selected, logits = select_and_project(hidden, weight, length + 3)
    observed["k_larger_than_length"] = {"k": length + 3, "hidden_shape": list(selected.shape)}
    check("k_larger_than_length_keeps_available_rows", torch.equal(selected, hidden)
          and list(logits.shape) == [b, length, vocab])

    reordered = torch.tensor([4, 1, 4], dtype=torch.long, device="cpu")
    selected, _ = select_and_project(hidden, weight, reordered)
    check("indices_keep_order_and_duplicates", selected.tolist()
          == [[batch[4], batch[1], batch[4]] for batch in original_rows])

    # Nonzero integer weights make row/projection checks observable, without RNG.
    nonzero_weight = torch.arange(vocab * hidden_size, dtype=torch.float32,
                                  device="cpu").reshape(vocab, hidden_size)
    selected, projected = select_and_project(hidden, nonzero_weight,
        torch.tensor([1, 4], dtype=torch.long, device="cpu"))
    manual = [[[sum(float(hidden[batch, row, column]) * float(nonzero_weight[word, column])
                    for column in range(hidden_size))
                for word in range(vocab)] for row in [1, 4]] for batch in range(b)]
    observed["nonzero_projection"] = {
        "shape": list(projected.shape),
        "first_row": projected[0, 0].tolist(),
        "reference": "Python scalar dot products of small integer-valued tensors",
    }
    check("projection_matches_scalar_dot_products", projected.tolist() == manual)
    full_projected = F.linear(hidden, nonzero_weight)
    check("select_then_project_matches_selected_full_projection",
          torch.equal(projected, full_projected[:, [1, 4], :]))

    # This is a position-mask illustration, not an attention/backbone test.
    right_padding = torch.tensor([[True, True, True, True, False, False],
                                  [True, True, True, True, True, True]],
                                 dtype=torch.bool, device="cpu")
    observed["right_padding_last_2_valid_positions"] = right_padding[:, -2:].tolist()
    check("last_2_selects_tensor_positions_even_when_padded",
          right_padding[:, -2:].tolist() == [[False, False], [True, True]])

    empty_hidden = torch.empty((b, 0, hidden_size), dtype=torch.float32, device="cpu")
    empty_selected, empty_logits = select_and_project(empty_hidden, weight, 0)
    observed["empty_sequence"] = {"hidden_shape": list(empty_selected.shape),
                                  "logits_shape": list(empty_logits.shape)}
    check("integer_0_on_empty_sequence", list(empty_selected.shape) == [b, 0, hidden_size]
          and list(empty_logits.shape) == [b, 0, vocab])

    expect_error("out_of_range_row_rejected", lambda: select_and_project(
        hidden, weight, torch.tensor([length], dtype=torch.long, device="cpu")), IndexError)
    expect_error("floating_index_rejected", lambda: select_and_project(
        hidden, weight, torch.tensor([1.0], dtype=torch.float32, device="cpu")), IndexError)
    check("article_inputs_unchanged", torch.equal(hidden, hidden_before)
          and torch.equal(weight, weight_before))

    print(json.dumps({
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "device": "cpu",
        "torch_threads": torch.get_num_threads(),
        "scope": "Synthetic tensor indexing and linear projection only; no model, cache, loss, performance, or Transformers execution.",
        "check_count": len(checks),
        "checks": checks,
        "observed": observed,
    }, indent=2, allow_nan=False))
    return 0 if all(item["passed"] for item in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
