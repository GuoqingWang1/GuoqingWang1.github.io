---
title: "Why Does the First Mixed Batch Fail After a Checkpoint Loads?"
description: "A field comparison and a minimal mixed-batch check show why successful loading does not establish correct restoration."
category: technical
topic: training
lang: en
translationKey: resume-first-mixed-batch
tags: [checkpoint, schema, 训练恢复]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 4
draft: false
review: true
---

We once encountered a resume failure that looked like this: the model and optimizer states had loaded, and the cached queue had been restored, but training stopped before the next batch entered computation. Strict batch validation reported that the cached samples and newly generated samples had different sets of fields.

Further inspection showed that the field had been present in the saved cache. The restore path had removed it. Loading the checkpoint alone produced no error; the problem appeared only when the two data paths met.

## Cached and fresh samples take different paths

[PyTorch's general checkpoint example](https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html) saves the model, optimizer, and training progress together. Training systems with prefetching, asynchronous generation, or partial reuse may also hold samples that have already been generated but not yet consumed. Those states must also survive saving, restoration, and subsequent consumption.

Here, a synthetic `trace` field stands in for metadata that downstream code still needs. Both records and their identifiers are illustrative:

```python
cached = {"sample_id": "old-1", "reward": 0.0, "trace": {"schema": 1}}
fresh = {"sample_id": "new-1", "reward": 0.0, "trace": {"schema": 1}}
restored = {key: value for key, value in cached.items() if key != "trace"}

print(sorted(restored))  # ['reward', 'sample_id']
print(sorted(fresh))     # ['reward', 'sample_id', 'trace']
print(set(restored) == set(fresh))  # False
```

Matching field sets would not be sufficient on its own: dtypes, shapes, correspondence between members, and field semantics may also need checking. But different field sets already show that the restored object does not satisfy the interface followed by fresh samples.

In this case, two feature paths shared a field. An older feature was disabled by design, while another active path still produced and consumed the metadata. The restore code used the old flag to infer that the column was no longer needed and removed it from cached samples. Newly generated samples did not pass through that cleanup, so they still carried the field.

Why can fresh-only runs or checks of restored objects miss this? Consider a check that only asks whether all members have the same field set:

| Members entering batch assembly | What comparing field sets reveals |
|---|---|
| All fresh samples | All contain `trace` and agree with one another |
| All incorrectly cleaned cached samples | All lack `trace` and still agree with one another |
| A mixture of restored and fresh samples | One side has the field and the other does not |

The second row matters: **agreement between members does not establish compliance with the downstream interface.** A check that uses the first member as its template can miss a field dropped from every member. Check both compatibility among members and conformance to the active interface.

## Fix the restore rules and keep strict batch validation

It is easy to make batch assembly pass immediately: remove the field from fresh samples, fill it with an empty value in restored samples, or retain only the intersection of all members' fields. The problem is that the content being removed or emptied may be exactly what downstream code needs.

A more specific question comes first: **Do the currently active producers and consumers require this field?** A historical configuration flag set to `false` cannot answer that question by itself.

For an active path that requires `trace`, restoration and batch assembly can share a small validator. This example checks only the synthetic record's field set and `trace` version:

```python
EXPECTED_FIELDS = {"sample_id", "reward", "trace"}

def validate_record(row):
    if set(row) != EXPECTED_FIELDS:
        raise ValueError("record fields do not match the active schema")
    trace = row["trace"]
    if not isinstance(trace, dict):
        raise ValueError("missing required trace")
    if type(trace.get("schema")) is not int or trace["schema"] != 1:
        raise ValueError("trace schema mismatch")
    return row

def restore_active_record(saved):
    return validate_record(saved)  # Preserve the record and its required fields

def join_records(cached_rows, fresh_rows):
    rows = cached_rows + fresh_rows
    for row in rows:
        validate_record(row)
    return rows
```

This does not recompute rewards or rewrite the saved record. It does not yet check dtypes, tensor shapes, identifier uniqueness, or internal ownership relationships, so it cannot replace a training framework's complete batch-assembly function. When the relevant feature really is disabled, old fields should be handled according to the defined migration rules; the active-path rule above should not simply be applied to that case.

In the actual fix, we retained strict batch validation and made the restore entry point recognize the metadata requirements of the active path. Missing required information and version mismatches still raised errors. Unknown state was not filled with a zero that merely looked valid.

## Include the first mixed batch in resume validation

Checking only that `load_state_dict` returns without an exception does not cover this failure. Using the synthetic records above, a small check can include both a positive case and a negative case:

```python
from copy import deepcopy

before = deepcopy(cached)  # An independent snapshot of this plain-dict example
batch = join_records([restore_active_record(cached)], [fresh])
assert [row["sample_id"] for row in batch] == ["old-1", "new-1"]
assert [row["reward"] for row in batch] == [0.0, 0.0]
assert batch[0] == before
assert cached == before  # Restoration did not rewrite the saved record

try:
    join_records([restored], [fresh])
except ValueError as error:
    assert str(error) == "record fields do not match the active schema"
else:
    raise AssertionError("the damaged restored record was accepted")
```

The positive case checks more than whether assembly succeeds: it checks that the cached member remains, the old/new order follows the example's convention, and rewards and required metadata survive. It compares against an independent snapshot captured beforehand, avoiding two references that still compare equal after their shared object is modified. The negative case ensures that the damaged record is still rejected. A real regression test should exercise the framework's actual restore and batch-assembly entry points and their ordering rules, rather than testing only this reduced function.

Keep several boundary cases as well: missing required fields, incompatible field versions, unknown extra fields, and restoration when the feature is genuinely disabled. The first cases should reject incompatible data according to the interface; valid restoration or migration after a feature is disabled should succeed. These cases check different conditions, and cannot all be reduced to “no exception this time.”

The fix first passed a limited check mixing restored and fresh samples. It then completed a real mixed batch and new updates in the original training path. That showed that the interface repair had passed the point where restored state was actually consumed; it did not establish a guarantee about training quality.

**The first mixed batch after a resume is a boundary worth testing separately.** Many failures do not appear in the save path or the fresh-data path alone. They become visible when the two meet.
