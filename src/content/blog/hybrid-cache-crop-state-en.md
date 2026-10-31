---
title: "Cropping the KV Cache Does Not Guarantee a Full State Rollback"
description: "In a hybrid-attention model, restoring the cache length does not mean convolution and recurrent states have returned to the original prefix."
category: technical
lang: en
topic: model
tags: [KV Cache, Transformers, 混合注意力]
pubDate: "2026-11-01T06:32:29+08:00"
order: 9
draft: false
review: true
translationKey: hybrid-cache-crop-state
---

When scoring two continuations of the same prefix, an intuitive approach is to score continuation A, crop the cache back to the original prefix length, and then score continuation B.

Whether that works depends on what the cache contains. For a model that combines attention layers with layers holding recurrent state, `crop` may not be a complete undo operation. This article specifically examines **the hybrid-cache implementation in Transformers v5.12.1**; its behavior should not be generalized to every model or version.

## Length describes only part of the state

An ordinary attention cache stores keys and values for past positions. If the implementation supports cropping, removing later positions is straightforward to picture.

A hybrid model’s cache may also hold convolution state and recurrent state. The latter is the state reached after processing a history, not a table organized by token position whose trailing rows can simply be removed. Deleting positions from KV does not, by itself, subtract the corresponding history from the current recurrent state.

This version of `DynamicCache` constructs different cache layers according to the layer types in the model configuration. Those layers do not all have the same cropping semantics. [Official construction logic](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1453-L1474)

## crop is not a historical snapshot

The top-level `Cache.crop` calls each layer’s `crop` method. In this version, `LinearAttentionCacheLayerMixin.crop` leaves the state unchanged: its implementation simply returns without cropping. [Top-level dispatch](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1347-L1350), [implementation for layers with recurrent state](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L912-L914)

Calling `crop(prefix_length)` after consuming continuation A therefore does not establish that the entire model has returned to the state reached after reading only the prefix. Even if the attention cache is shorter, other layers may still hold states produced after consuming the continuation.

Checking `get_seq_length()` alone is insufficient too. In this version’s hybrid cache, the default length query finds an attention layer and reads its length; it does not describe the history represented by every recurrent state. [Official length-query logic](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1249-L1270)

Similarly, `reset` usually clears state rather than restoring a previously computed prefix. Clearing state, cropping it, and restoring a historical snapshot should be treated as three different operations.

## Isolate state for independent scoring

A direct approach is to give each independent scoring task its own cache. Within a task, the cache can be reused across consecutive input chunks. When switching to another independent continuation, rebuild its state from the prefix.

The following diagram uses two synthetic continuations:

```text
New cache A → Consume prefix → Consume continuation A → Read score → Discard A
New cache B → Consume prefix → Consume continuation B → Read score → Discard B
```

This recomputes the prefix, so it is not a free optimization. Its value is an explicit state boundary: the second continuation does not depend on an unverified assumption that cropping restored every layer’s state.

To share prefix computation, use branching, copying, or restoration mechanisms explicitly supported by the model and cache implementation, and confirm that they include convolution state, recurrent state, and KV. Copying only the Python container, or merely observing the same KV length, is insufficient to establish isolation between two tasks. Check whether mutable tensors still share storage as well.

Before reusing a cache, establish one thing: **What history is the current model state guaranteed to correspond to?** Make state ownership and restoration semantics explicit, then decide how to save prefix computation.
