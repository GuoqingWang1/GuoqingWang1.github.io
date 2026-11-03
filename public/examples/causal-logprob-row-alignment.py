#!/usr/bin/env python3
"""Synthetic CPU checks of the article's next-token shift/mask/gather helper.

Inputs are complete, untrimmed [B,L,V] logits and unshifted labels. There is no
model, tokenizer, attention mask, cache, or Transformers execution. Chunk tests
index the same synthetic logits, not separately computed model outputs. The
article's shape/dtype/device assertions become explicit input errors here so
those guards remain active under python -O; the scoring logic is unchanged.
"""

import json
import math
import platform

import torch


def masked_next_token_logprobs(logits, labels):
    if logits.ndim != 3 or labels.shape != logits.shape[:2]:
        raise ValueError("expected complete [B,L,V] logits and [B,L] labels")
    if labels.dtype != torch.long:
        raise TypeError("labels must have torch.long dtype")
    if labels.device != logits.device:
        raise ValueError("labels and logits must be on the same device")

    targets = labels[:, 1:]
    keep = targets.ne(-100)
    invalid = keep & ((targets < 0) | (targets >= logits.shape[-1]))
    if invalid.any():
        raise ValueError("target ID outside vocabulary")

    safe_targets = targets.masked_fill(~keep, 0)
    logp = logits[:, :-1, :].log_softmax(dim=-1)
    scores = logp.gather(-1, safe_targets.unsqueeze(-1)).squeeze(-1)
    return scores, keep


def scalar_logprob(row, target_id):
    peak = max(row)
    return row[target_id] - peak - math.log(sum(math.exp(value - peak) for value in row))


def local_prediction_row(target_position, chunk_start, chunk_end):
    prediction_row = target_position - 1
    if not chunk_start <= prediction_row < chunk_end:
        raise ValueError("prediction row belongs outside this chunk")
    return prediction_row - chunk_start


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

    labels = torch.tensor([[-100, -100, -100, 3, 4, -100]],
                          dtype=torch.long, device="cpu")
    labels_before = labels.clone()
    zeros = torch.zeros((1, 6, 5), dtype=torch.float32, device="cpu")
    zero_scores, zero_keep = masked_next_token_logprobs(zeros, labels)
    observed["article_zero_logits"] = {"keep": zero_keep.tolist(),
                                       "selected_scores": zero_scores[zero_keep].tolist()}
    check("article_mask", zero_keep.tolist() == [[False, False, True, True, False]])
    check("article_target_ids", labels[:, 1:][zero_keep].tolist() == [3, 4])
    check("article_two_scores", zero_scores[zero_keep].numel() == 2)
    check("uniform_logits_have_uniform_logprob", all(math.isclose(value, -math.log(5),
          rel_tol=1e-6, abs_tol=1e-6) for value in zero_scores[zero_keep].tolist()))

    rows = [[2.0, 0.0, -1.0, -2.0, -3.0],
            [0.0, 1.0, 0.0, -1.0, -2.0],
            [0.0, 0.0, 0.0, 4.0, 0.0],
            [0.0, 0.0, 0.0, 0.0, 3.0],
            [3.0, 2.0, 1.0, 0.0, -2.0],
            [-1.0, 2.0, 0.0, 1.0, -3.0]]
    logits = torch.tensor([rows], dtype=torch.float32, device="cpu")
    logits_before = logits.clone()
    scores, keep = masked_next_token_logprobs(logits, labels)
    selected = scores[keep].tolist()
    reference = [scalar_logprob(rows[2], 3), scalar_logprob(rows[3], 4)]
    unshifted = [scalar_logprob(rows[3], 3), scalar_logprob(rows[4], 4)]
    double_shifted = [scalar_logprob(rows[1], 3), scalar_logprob(rows[2], 4)]
    observed["nonuniform_logits"] = {
        "target_positions": [3, 4], "prediction_rows": [2, 3], "target_ids": [3, 4],
        "selected_scores": selected, "scalar_reference": reference,
        "wrong_unshifted_rows": [3, 4], "wrong_unshifted_scores": unshifted,
        "wrong_double_shift_rows": [1, 2], "wrong_double_shift_scores": double_shifted,
    }
    check("scores_match_scalar_reference", len(selected) == len(reference)
          and all(math.isclose(actual, expected, rel_tol=1e-6, abs_tol=1e-6)
                  for actual, expected in zip(selected, reference)))
    check("wrong_unshifted_rows_change_scores", all(abs(a - b) > 1e-3
          for a, b in zip(reference, unshifted)))
    check("double_shift_changes_scores", all(abs(a - b) > 1e-3
          for a, b in zip(reference, double_shifted)))
    check("mask_stays_aligned", keep.tolist() == [[False, False, True, True, False]])
    check("masked_sum_matches_selected_reference", math.isclose(float(scores[keep].sum()),
          sum(reference), rel_tol=1e-6, abs_tol=1e-6))

    ignored = torch.full((1, 6), -100, dtype=torch.long, device="cpu")
    ignored_scores, ignored_keep = masked_next_token_logprobs(logits, ignored)
    # An empty selection has no mean score; do not evaluate mean() on it.
    empty_mean = float(ignored_scores[ignored_keep].mean()) if bool(ignored_keep.any()) else None
    observed["all_targets_ignored"] = {"selected_count": ignored_scores[ignored_keep].numel(),
                                       "mean": empty_mean}
    check("empty_target_set_is_explicit", ignored_scores[ignored_keep].numel() == 0
          and empty_mean is None)

    single_logits = torch.zeros((1, 1, 5), dtype=torch.float32, device="cpu")
    single_labels = torch.tensor([[-100]], dtype=torch.long, device="cpu")
    single_scores, single_keep = masked_next_token_logprobs(single_logits, single_labels)
    observed["single_input_position"] = {"score_shape": list(single_scores.shape),
                                          "keep_shape": list(single_keep.shape)}
    check("single_position_has_no_next_token_target", list(single_scores.shape) == [1, 0]
          and list(single_keep.shape) == [1, 0])

    boundary_labels = torch.tensor([[-100, 0, 4, -100, -100, -100]],
                                   dtype=torch.long, device="cpu")
    boundary_scores, boundary_keep = masked_next_token_logprobs(logits, boundary_labels)
    boundary_reference = [scalar_logprob(rows[0], 0), scalar_logprob(rows[1], 4)]
    check("vocabulary_endpoints_are_valid", boundary_labels[:, 1:][boundary_keep].tolist() == [0, 4]
          and all(math.isclose(actual, expected, rel_tol=1e-6, abs_tol=1e-6)
                  for actual, expected in zip(boundary_scores[boundary_keep].tolist(), boundary_reference)))

    for name, bad_id in [("negative_unmasked_id", -1), ("id_at_vocab_size", 5)]:
        invalid_labels = labels.clone()
        invalid_labels[0, 3] = bad_id
        expect_error(name, lambda: masked_next_token_logprobs(logits, invalid_labels), ValueError)
    expect_error("wrong_label_shape", lambda: masked_next_token_logprobs(logits, labels[:, :-1]), ValueError)
    expect_error("wrong_logits_rank", lambda: masked_next_token_logprobs(logits[0], labels), ValueError)
    expect_error("wrong_label_dtype", lambda: masked_next_token_logprobs(logits,
        torch.tensor(labels.tolist(), dtype=torch.int32, device="cpu")), TypeError)

    chunk_scores = []
    mappings = []
    for target_position, target_id, start, end in [(3, 3, 0, 3), (4, 4, 3, 6)]:
        local_row = local_prediction_row(target_position, start, end)
        chunk_logp = logits[0, start:end, :].log_softmax(dim=-1)
        chunk_scores.append(float(chunk_logp[local_row, target_id]))
        mappings.append({"target_position": target_position, "prediction_row": target_position - 1,
                         "chunk": [start, end], "local_row": local_row})
    observed["synthetic_chunk_indexing"] = {"mappings": mappings, "scores": chunk_scores}
    check("chunk_local_rows", [item["local_row"] for item in mappings] == [2, 0])
    check("chunk_indexing_matches_full_tensor", len(chunk_scores) == len(selected)
          and all(math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)
                  for a, b in zip(chunk_scores, selected)))
    expect_error("chunk_start_target_rejects_negative_local_row",
                 lambda: local_prediction_row(3, 3, 6), ValueError)
    expect_error("first_input_has_no_previous_prediction_row",
                 lambda: local_prediction_row(0, 0, 3), ValueError)
    wrong_wrapped_score = float(logits[0, 3:6, :].log_softmax(dim=-1)[-1, 3])
    observed["wrong_negative_index"] = {"selected_global_row": 5, "score": wrong_wrapped_score}
    check("negative_index_would_select_wrong_chunk_row", not math.isclose(wrong_wrapped_score,
          reference[0], rel_tol=1e-6, abs_tol=1e-6))
    check("original_inputs_unchanged", torch.equal(labels, labels_before)
          and torch.equal(logits, logits_before))

    print(json.dumps({
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "device": "cpu",
        "torch_threads": torch.get_num_threads(),
        "scope": "Synthetic full-logit shift, gather, mask, and chunk-index checks only; no model, cache, loss interface, attention mask, or Transformers execution.",
        "check_count": len(checks),
        "checks": checks,
        "observed": observed,
    }, indent=2, allow_nan=False))
    return 0 if all(item["passed"] for item in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
