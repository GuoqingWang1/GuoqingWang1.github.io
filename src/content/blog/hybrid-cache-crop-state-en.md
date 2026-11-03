---
title: "Cropping the KV Cache Does Not Guarantee a Full State Rollback"
description: "In a hybrid-attention model, restoring the cache length does not mean convolution and recurrent states have returned to the original prefix."
category: technical
lang: en
topic: model
tags: [KV Cache, Transformers, 混合注意力]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T20:38:15+08:00"
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

## Trace a small state before and after cropping

An independent toy makes the distinction concrete: a list records processed inputs, while an integer is updated by `state = 10 * state + value`. This recurrence is not a model’s computation or a measurement of cache contamination. It simply makes position-indexed data and accumulated state easy to trace by hand.

```python
class ToyCache:
    def __init__(self):
        self.slots = []
        self.state = 0

    def append(self, value):
        self.slots.append(value)
        self.state = 10 * self.state + value

    def crop(self, length):
        self.slots = self.slots[:length]  # Does not restore recurrent state

reused = ToyCache()
for value in [1, 2]:
    reused.append(value)
assert reused.state == 12

reused.append(3)  # Continuation A
reused.crop(2)
assert len(reused.slots) == 2
assert reused.state == 123  # Length returns to 2; state does not return to 12
reused.append(4)  # Then process continuation B

fresh = ToyCache()
for value in [1, 2, 4]:
    fresh.append(value)

assert reused.slots == fresh.slots == [1, 2, 4]
assert (reused.state, fresh.state) == (1234, 124)
```

The two paths make the state divergence visible:

<figure class="note-diagram cache-state-diagram" data-diagram="cache-state" lang="en" aria-labelledby="cache-state-title">
<p class="diagram-title" id="cache-state-title">Restoring length does not restore accumulated state</p>
<div class="diagram-origin">After prefix [1,2] and continuation A=3<span><code>slots = [1,2,3] · state = 123</code></span></div>
<div class="diagram-paths"><div class="diagram-path"><p class="diagram-path-label">Reuse after cropping</p>
<ol class="diagram-steps">
<li><span class="diagram-step-action"><code>crop(2)</code><span class="diagram-step-detail">Shorten slots; state stays unchanged</span></span><dl class="cache-values"><div><dt>slots</dt><dd><code>[1,2]</code></dd></div><div><dt>state</dt><dd class="cache-state"><code>123</code></dd></div></dl></li>
<li>Then append B=4<dl class="cache-values cache-result"><div><dt>slots</dt><dd><code>[1,2,4]</code></dd></div><div><dt>state</dt><dd class="cache-state"><code>1234</code></dd></div></dl></li>
</ol></div><div class="diagram-path"><p class="diagram-path-label">Rebuild independently</p>
<ol class="diagram-steps">
<li><span class="diagram-step-action">Create a new cache and replay the prefix</span><dl class="cache-values"><div><dt>slots</dt><dd><code>[1,2]</code></dd></div><div><dt>state</dt><dd class="cache-state"><code>12</code></dd></div></dl></li>
<li>Then append B=4<dl class="cache-values cache-result"><div><dt>slots</dt><dd><code>[1,2,4]</code></dd></div><div><dt>state</dt><dd class="cache-state"><code>124</code></dd></div></dl></li>
</ol></div></div>
<p class="diagram-key">Same final slots, different state: <strong><code>1234 ≠ 124</code></strong></p>
<figcaption>This is ToyCache’s integer recurrence, state = 10 × state + value. The slots are not real KV tensors, and the numbers are not model scores.</figcaption>
</figure>

The two paths end with identical list contents, yet their recurrent states differ. Checking only length—or even the contents of the croppable part—would miss this difference. These numbers come from the toy’s integer recurrence, not model scores; they illustrate why the complete state matters.

In this toy, the prefix state `12` is easy to write down, but `crop` did not restore it. A real model needs the valid state corresponding to the prefix, not an inversion of this invented formula. Choosing `reset` also requires consuming the prefix again rather than clearing state and proceeding directly with B.

## Isolate state for independent scoring

A direct approach is to give each independent scoring task its own cache. Within a task, the cache can be reused across consecutive input chunks. When switching to another independent continuation, rebuild its state from the prefix.

The following diagram uses two synthetic continuations:

```text
New cache A → Consume prefix → Consume continuation A → Read score → Discard A
New cache B → Consume prefix → Consume continuation B → Read score → Discard B
```

This recomputes the prefix, so it is not a free optimization. Its value is an explicit state boundary: the second continuation does not depend on an unverified assumption that cropping restored every layer’s state.

To share prefix computation, use branching, copying, or restoration mechanisms explicitly supported by the model and cache implementation, and confirm that they include convolution state, recurrent state, and KV. Copying only the Python container, or merely observing the same KV length, is insufficient to establish isolation between two tasks. Check whether mutable tensors still share storage as well.

For example, if two variables refer to the same cache, appending content for A also changes the state that B will subsequently see. Safe copying must be supported by the specific cache type; generic `deepcopy` is not a rollback solution that every implementation supports. Validation should compare the reuse path with consuming the same prefix from a fresh state, checking the required states and outputs rather than only a length field.

Before reusing a cache, establish one thing: **What history is the current model state guaranteed to correspond to?** Make state ownership and restoration semantics explicit, then decide how to save prefix computation.

## Run the example locally

[Download the complete script](/examples/hybrid-cache-crop-state.py). It requires only the Python standard library. On 2026-11-03, all 20 checks passed with **Python 3.11.11 on a macOS arm64 CPU**:

```sh
python hybrid-cache-crop-state.py
```

Both paths ended with the list `[1,2,4]`, but reuse after cropping left state `1234`, while rebuilding independently produced `124`. The script also checks that aliases of the same object share changes and that `crop(0)` clears the list without clearing the recurrent state. See the [recorded output](/examples/cpu-verification-more.json).

This executes the article's **integer/list ToyCache logic**. It does not test a real KV cache, convolution state, tensor storage, or Transformers. The pinned implementation's real cache behavior remains supported by the source references above.
