---
title: "Which Logit Row Predicts the Target Token?"
description: "From next-token shifting to chunk boundaries: avoid pairing a target token with the wrong prediction row."
category: technical
lang: en
topic: model
tags: [语言模型, LogProb, 张量对齐]
pubDate: "2026-11-01T06:32:29+08:00"
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

When extracting scores from complete logits yourself, the following simplified form is useful. It assumes there is no padding and that logit positions have not been trimmed. Entry `i` in the returned result corresponds to input token `i+1`.

```python
def next_token_logprobs(logits, token_ids):
    # logits: [B, L, V]; token_ids: [B, L]
    logp = logits[:, :-1, :].log_softmax(dim=-1)
    targets = token_ids[:, 1:]
    return logp.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
```

If a loss interface already shifts labels internally, do not shift them beforehand as well. An intended one-position offset would become two. First establish whether an interface returns complete logits, selected prediction rows, or token logprobs that have already been aligned.

Real batches also require aligned scoring masks. A target-token mask must move with its target positions; shifting only logits and token IDs is not enough. A mask that controls attention is not automatically the mask specifying which tokens contribute to the answer score.

## The first target in a chunk may belong to the previous chunk

Suppose the current input chunk covers global positions `[s, e)`. Row `0` of its output is global prediction row `s`, which predicts `x[s+1]`. For a target at global position `j`, the local prediction-row index is `j-1-s`.

The easy-to-miss case is `j=s`: the target is exactly at the beginning of the chunk, so the local prediction-row index becomes `-1`. That is not permission to let Python select the current chunk’s final row. It tells us that the required prediction row is **at the end of the previous chunk**.

Enabling a KV cache does not automatically bring the previous chunk’s logits into the current output. The scoring schedule can assign this target to the previous chunk’s final row, or retain the prediction result needed from that row; the choice depends on the existing output interface. Having the target token in the current chunk does not justify substituting the current chunk’s first logit row.

When checking this code, I write down three quantities explicitly: the target token’s global position, the prediction row’s global position, and the prediction row’s local position within its chunk. Match those one by one before comparing scores across chunking schemes. Position alignment is necessary; numerical agreement additionally requires comparable weights, position encoding, masks, and computation precision.
