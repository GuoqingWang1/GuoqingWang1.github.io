---
title: "Why Does the First Mixed Batch Fail After a Checkpoint Loads?"
description: "Resume checks need to reach the first batch of cached and newly generated samples, and verify that required fields survive."
category: technical
topic: training
lang: en
translationKey: resume-first-mixed-batch
tags: [checkpoint, schema, 训练恢复]
pubDate: "2026-11-01T06:32:29+08:00"
order: 4
draft: false
review: true
---

We once encountered a resume failure that looked like this: the model and optimizer states had loaded, and the cached queue had been restored, but training stopped before the next batch entered computation. Strict batch validation reported that the cached samples and newly generated samples had different sets of fields.

Further inspection showed that the field had been present in the saved cache. The restore path had removed it. Loading the checkpoint alone produced no error; the problem appeared only when the two data paths met.

## Cached and fresh samples take different paths

[PyTorch's general checkpoint example](https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html) saves the model, optimizer, and training progress together. Training systems with prefetching, asynchronous generation, or partial reuse may also hold samples that have already been generated but not yet consumed. Those states must also survive saving, restoration, and subsequent consumption.

Here, a synthetic `trace` field stands in for metadata that downstream code still needs:

```python
cached = {"reward": 0.0, "trace": {"schema": 1}}
restored = {"reward": 0.0}  # The restore path incorrectly removed trace
fresh = {"reward": 0.0, "trace": {"schema": 1}}

assert set(restored) == set(fresh)  # The first mixed batch exposes the difference
```

Matching field sets would not be sufficient on its own: dtypes, shapes, correspondence between members, and field semantics may also need checking. But different field sets already show that the restored object does not satisfy the interface followed by fresh samples.

In this case, two feature paths shared a field. An older feature was disabled by design, while another active path still produced and consumed the metadata. The restore code used the old flag to infer that the column was no longer needed and removed it from cached samples. Newly generated samples did not pass through that cleanup, so they still carried the field.

## Fix the restore rules and keep strict batch validation

It is easy to make batch assembly pass immediately: remove the field from fresh samples, fill it with an empty value in restored samples, or retain only the intersection of all members' fields. The problem is that the content being removed or emptied may be exactly what downstream code needs.

A more specific question comes first: **Do the currently active producers and consumers require this field?** A historical configuration flag set to `false` cannot answer that question by itself.

For a restore path that explicitly requires `trace`, the requirement can be written directly:

```python
def restore_active_record(saved, expected_schema):
    trace = saved.get("trace")
    if not isinstance(trace, dict):
        raise ValueError("missing required trace")
    if trace.get("schema") != expected_schema:
        raise ValueError("trace schema mismatch")
    return saved
```

This small example only checks and preserves a required field. It does not recompute rewards or rewrite the saved record. A real interface must also validate the structures and member relationships it requires. When the relevant feature really is disabled, old fields should be handled according to the defined migration rules; the active-path rule above should not simply be applied to that case.

In the actual fix, we retained strict batch validation and made the restore entry point recognize the metadata requirements of the active path. Missing required information and version mismatches still raised errors. Unknown state was not filled with a zero that merely looked valid.

## Include the first mixed batch in resume validation

Checking only that `load_state_dict` returns without an exception does not cover this failure. A more targeted test should:

1. Restore some already generated members from saved state.
2. Prepare some fresh members through the currently active path.
3. Combine them through the real batch-assembly entry point.
4. Check that existing fields, values, member order, and unconsumed data have been preserved.

Keep several boundary cases as well: missing required fields, incompatible field versions, unknown extra fields, and restoration when the feature is genuinely disabled. The first cases should reject incompatible data according to the interface; valid restoration or migration after a feature is disabled should succeed. These cases check different conditions, and cannot all be reduced to “no exception this time.”

The fix first passed a limited check mixing restored and fresh samples. It then completed a real mixed batch and new updates in the original training path. That showed that the interface repair had passed the point where restored state was actually consumed; it did not establish a guarantee about training quality.

**The first mixed batch after a resume is a boundary worth testing separately.** Many failures do not appear in the save path or the fresh-data path alone. They become visible when the two meet.
