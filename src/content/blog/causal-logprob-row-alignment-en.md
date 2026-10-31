---
title: "Which Logit Row Predicts the Target Token?"
description: "From next-token shifting to chunk boundaries: avoid pairing a target token with the wrong prediction row."
category: technical
lang: en
topic: model
tags: [语言模型, LogProb, 张量对齐]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 2
draft: false
review: true
translationKey: causal-logprob-row-alignment
---

When writing language-model scoring code, one of the easiest checks to miss is the correspondence between a target token and its logit row. The shapes may match perfectly, and every computed value may be finite, yet the result may not be the conditional probability we intended to measure.

Here we consider ordinary next-token scoring in an autoregressive language model: given a prefix, compute the probabilities of subsequent tokens. All examples are synthetic position diagrams, not real samples.

## Token j is predicted by row j−1

For a complete input `x[0], x[1], ...`, hidden-state row `j` has already consumed `x[j]`. Its logits predict the token that follows. Target `x[j]` therefore belongs with prediction row `j-1`, rather than row `j` with the same index.

Consider a short sequence with a beginning-of-sequence token:

```text
Input position       0      1      2      3      4
Input token         BOS     P0     P1     A0     A1
Target of this row   P0     P1     A0     A1     Next token
```

To score only the answer tokens `A0, A1`, select logit rows `2, 3`. Selecting rows `3, 4` and gathering the entries for `A0, A1` still produces two numbers, but their conditioning contexts differ: the model has already seen the target token when it produces the corresponding hidden state.

If the prefix contains `C` tokens—at least one, such as BOS—and the answer contains `M` tokens, the answer’s prediction-row interval is `[C-1, C+M-1)`, containing `M` rows. In particular, check that the first answer token is predicted by the last prefix row. These are actual token counts, not the length of the decoded string.

Transformers v5.12.1’s `ForCausalLMLoss` follows this correspondence: it aligns each row with the next label and ignores the final position, which has no subsequent target. [Official implementation](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/loss/loss_utils.py#L48-L71)

## Shift only once

When extracting scores from complete logits yourself, separate two choices: which row to read, and which vocabulary entry to select in that row. The first follows from subtracting one from the target position; the second comes from the target token ID. `gather(dim=-1)` performs only the second operation—it does not fix temporal alignment. The [`torch.gather` interface](https://docs.pytorch.org/docs/2.15/generated/torch.gather.html) requires explicit indices and has no `ignore_index` argument.

Below, we add one right-padding position to the sequence above. The synthetic vocabulary has five entries, with IDs `3, 4` assigned to answer tokens `A0, A1`. `labels` aligns with the original input positions; prefix and padding positions use `-100` to exclude them from scoring. These `labels` are not the `input_ids` passed to the model, and the code does not construct the `attention_mask` used in the model’s forward pass.

```python
import torch

def masked_next_token_logprobs(logits, labels):
    # Full, untrimmed logits; labels have not been shifted.
    assert logits.ndim == 3 and labels.shape == logits.shape[:2]
    assert labels.dtype == torch.long and labels.device == logits.device

    targets = labels[:, 1:]
    keep = targets.ne(-100)
    invalid = keep & ((targets < 0) | (targets >= logits.shape[-1]))
    if invalid.any():
        raise ValueError("target ID outside vocabulary")

    # -100 is not a valid vocabulary index; use a safe index only at ignored positions.
    safe_targets = targets.masked_fill(~keep, 0)
    logp = logits[:, :-1, :].log_softmax(dim=-1)
    scores = logp.gather(-1, safe_targets.unsqueeze(-1)).squeeze(-1)
    return scores, keep

logits = torch.zeros((1, 6, 5), dtype=torch.float32, device="cpu")
labels = torch.tensor([[-100, -100, -100, 3, 4, -100]], dtype=torch.long, device="cpu")
scores, keep = masked_next_token_logprobs(logits, labels)

assert keep.tolist() == [[False, False, True, True, False]]
assert labels[:, 1:][keep].tolist() == [3, 4]
assert scores[keep].numel() == 2
```

After shifting, entry `i` in `scores` corresponds to input token `i+1`, so this example keeps only prediction rows `2, 3`. The placeholder index `0` merely makes `gather` valid; scores at ignored positions have no scoring meaning and must still be excluded with `keep` before aggregation. Indexing with `-100` first and multiplying by a mask afterward cannot repair an invalid indexing operation. [`masked_fill`](https://docs.pytorch.org/docs/2.15/generated/torch.Tensor.masked_fill.html) returns a new tensor here without rewriting the original labels.

This example checks position and mask relationships. The zero logits are placeholder inputs, and the assertions describe expected relationships rather than measured model scores. If there are no scoring positions, the caller should also handle that empty set explicitly instead of taking its mean directly.

If a loss interface already shifts labels internally, do not shift them beforehand as well. An intended one-position offset would become two. First establish whether an interface returns complete logits, selected prediction rows, or token logprobs that have already been aligned.

Real batches also require aligned scoring masks. A target-token mask must move with its target positions; shifting only logits and token IDs is not enough. A mask that controls attention is not automatically the mask specifying which tokens contribute to the answer score.

## The first target in a chunk may belong to the previous chunk

Suppose the current input chunk covers global positions `[s, e)` and its output rows have not been trimmed. Row `0` of its output is global prediction row `s`, which predicts `x[s+1]`. For a target at global position `j`, the local prediction-row index is `j-1-s`. If rows have already been selected, use the saved row mapping rather than applying this offset directly.

The easy-to-miss case is `j=s`: the target is exactly at the beginning of the chunk, so the local prediction-row index becomes `-1`. That is not permission to let Python select the current chunk’s final row. It tells us that the required prediction row is **at the end of the previous chunk**.

Split the six positions above into chunks `[0,3)` and `[3,6)`. The answer-token mapping can be worked out directly:

| Target | Global target position `j` | Prediction row `j-1` | Chunk producing the row | Local row in that chunk |
|---|---:|---:|---|---:|
| `A0` | 3 | 2 | `[0,3)` | 2 |
| `A1` | 4 | 3 | `[3,6)` | 0 |

Although the second chunk contains both answer tokens, its own row `0` supplies only the prediction for `A1`. The prediction for `A0` must come from the first chunk’s final row. Checking `s <= j-1 < e` before indexing explicitly rejects targets whose prediction rows belong elsewhere, rather than silently letting a negative index wrap to the end.

Enabling a KV cache does not automatically bring the previous chunk’s logits into the current output. The scoring schedule can assign this target to the previous chunk’s final row, or retain the prediction result needed from that row; the choice depends on the existing output interface. Having the target token in the current chunk does not justify substituting the current chunk’s first logit row.

When checking this code, I write down three quantities explicitly: the target token’s global position, the prediction row’s global position, and the prediction row’s local position within its chunk. Match those one by one before comparing scores across chunking schemes. Position alignment is necessary; numerical agreement additionally requires comparable weights, position encoding, masks, and computation precision.
