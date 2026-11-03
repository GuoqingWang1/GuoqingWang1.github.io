---
title: "Why Doesn’t logits_to_keep=0 Mean “Compute No Logits”?"
description: "Compare integer zero, the last k rows, an empty index, and selected rows on the same tensor, then trace their effects on the output layer and chunked scoring."
category: technical
lang: en
topic: model
tags: [PyTorch, Transformers, Logits]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 1
draft: false
review: true
translationKey: logits-to-keep-zero
---

When scoring long text, we often need logits at only a few positions. After splitting the input into chunks, some chunks may contain no positions that need scoring. Setting `logits_to_keep` to `0` can look like a natural way to say “This chunk needs no output.”

But in **Transformers v5.12.1’s `Qwen3_5ForCausalLM`**, integer `0` retains every position. To request zero positions, use an empty index tensor. This affects both the shape of the returned value and how many rows the output layer processes.

## One tensor, four selections

This version computes `hidden_states`, selects rows, and then calls `lm_head`. For an integer argument, the selector is `slice(-logits_to_keep, None)`; an index tensor is used directly. [Source for the pinned version](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/models/qwen3_5/modeling_qwen3_5.py#L1675-L1678)

A positive integer `k` therefore selects the last `k` rows; if `k` exceeds the current length, ordinary slicing returns at most the available rows. Integer `0` becomes `slice(0, None)`, which selects everything. An empty tensor takes a different indexing branch and is not interchangeable with integer zero.

The standalone example below constructs only small tensors and loads no language model. Let `B=2, L=6, H=4` denote batch size, sequence length, and hidden dimension. A weight of shape `[V,H]=[10,4]` stands in for the output projection. All values are synthetic and serve only to illustrate shapes.

```python
import torch
import torch.nn.functional as F

B, L, H, V = 2, 6, 4, 10
hidden = torch.arange(B * L * H, dtype=torch.float32).reshape(B, L, H)
weight = torch.zeros(V, H)

choices = {
    "integer 0": 0,
    "last 2": 2,
    "empty tensor": torch.empty(0, dtype=torch.long),
    "rows [1, 4]": torch.tensor([1, 4], dtype=torch.long),
}

for name, keep in choices.items():
    index = slice(-keep, None) if isinstance(keep, int) else keep
    selected = hidden[:, index, :]
    logits = F.linear(selected, weight)
    print(name, tuple(selected.shape), tuple(logits.shape))
```

The indexing logic gives the following expected shapes. Positions are zero-indexed:

| Argument | Retained positions | Selected hidden states | Logits |
|---|---|---|---|
| Integer `0` | `0,1,2,3,4,5` | `[2,6,4]` | `[2,6,10]` |
| Integer `2` | `4,5` | `[2,2,4]` | `[2,2,10]` |
| Empty LongTensor | None | `[2,0,4]` | `[2,0,10]` |
| LongTensor `[1,4]` | `1,4` | `[2,2,4]` | `[2,2,10]` |

Integer `2` and the index `[1,4]` both retain two rows, but at different positions. Check the actual row indices as well as the output shape. The one-dimensional index here selects the same positions for both batch members; it does not express a different selection for each sample.

Padding matters at this boundary too. The slice in the source does not use `attention_mask` to find the “last few valid tokens”; it selects tensor positions. With right padding, the last two rows may fall in the padded region. If samples in a batch have different true lengths, a shared set of row indices may not match the scoring target. Establish each sample’s required prediction positions before choosing the corresponding scoring interface.

## Reduce the positions processed by the output layer

Selecting `M` rows gives an input to the output layer of shape `[B,M,H]`. With weights of shape `[V,H]`, the linear transformation maps the last dimension from `H` to `V`, producing `[B,M,V]`. This follows [PyTorch’s shape convention for `linear`](https://docs.pytorch.org/docs/2.15/generated/torch.nn.functional.linear.html).

The selection reduces sequence positions, not vocabulary size. Each retained row still contains `V` logits. An empty index makes `M=0`, while integer `0` makes `M=L` in this interface.

The timing of the selection matters as well. Computing the full logits and slicing the returned result does not undo the vocabulary projection that has already happened. This implementation selects before `lm_head`, allowing it to avoid computing unwanted output rows.

However, fewer output rows alone do not determine the model’s peak memory use or running time. The backbone, cache, temporary workspace, and output layer have different costs and should be measured at their actual boundaries.

## Chunks with no target rows still need to advance the cache

Suppose we split an input into two successive chunks with `use_cache=True`, and every prediction row we need to read lies in the second chunk. The first chunk can use an empty row index, but it must still pass through the backbone so that the model consumes the prefix and supplies its updated cache to the second chunk.

Skipping the first chunk’s forward pass would change the history available to the second. An empty output means that this chunk has no prediction distributions we need to read; it does not mean the chunk has no role in conditioning later predictions.

For chunked calls, I check two things together: the chunk with no target rows really returns zero logit rows, and it still consumes its complete input so that later calls receive its updated cache. Checking only the first can turn an output-row optimization into an unintended omission of prefix context.

## Align local row indices and labels separately

The row index refers to **the hidden states returned by this forward pass**. If the current chunk starts at global position `s`, global prediction row `p` corresponds to local row `p-s`. It can be selected in this call only if it falls within the current chunk.

Also distinguish [target tokens from prediction rows](/blog/causal-logprob-row-alignment/): in autoregressive scoring, the token at global position `j` is predicted by row `j-1`. If the target falls exactly at the start of a chunk, the required prediction row is at the end of the previous chunk. A calculated index of `-1` must not be interpreted as the last row of the current chunk.

This article covers calls with **`labels=None` that only read logits**. If `labels` are also supplied to compute a loss, the selected prediction rows and labels must be aligned according to that interface. Empty or partial outputs cannot simply be paired with the full labels. This version enters the loss branch after selecting rows, so that ordering should be checked too. [Relevant source](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/models/qwen3_5/modeling_qwen3_5.py#L1675-L1682)

Finally, check whether an outer wrapper converts an empty list into the default integer `0`. That tiny conversion may raise no error while changing “zero positions” back into “all positions.” Preserving explicit parameter types and index counts is often more direct than trying to infer the amount of work from the result afterward.

## Run the example locally

[Download the complete script](/examples/logits-to-keep-zero.py). On 2026-11-03, all 22 checks passed on a macOS arm64 CPU with **Python 3.11.11, PyTorch 2.6.0, and one thread**. Save the script with a Python 3.11 virtual environment active, then run:

```sh
python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
python logits-to-keep-zero.py
```

The four selectors produced logit shapes `[2,6,10]`, `[2,2,10]`, `[2,0,10]`, and `[2,2,10]`, respectively. The script also compares row contents, checks a nonzero-weight projection against Python scalar dot products, and covers out-of-range indices, empty sequences, and input preservation. See the [recorded output](/examples/cpu-verification-more.json).

This executes the same selector expression and a small tensor projection; **it loads neither Transformers nor a model**. Backbone execution, caches, labels/loss, peak memory, and end-to-end speed are outside this check.
