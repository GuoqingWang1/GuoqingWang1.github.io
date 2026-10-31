---
title: "String Width Is Part of dtype: A Schema Check That Rejected a Valid Batch"
description: "Distinguishing different fixed-width string capacities from genuinely incompatible field types."
category: technical
lang: en
translationKey: numpy-string-dtype-width
topic: training
tags: [NumPy, 数据类型, 合批]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 5
draft: false
review: true
---

A smoke test of a training pipeline stopped during batch assembly because of a non-tensor field. The field contained strings in both inputs, and neither its name nor its structure had changed, yet strict validation reported a dtype mismatch.

The error came from our own schema check: it required the two NumPy dtypes to be exactly equal. For fixed-width strings, the dtype also includes capacity. When arrays are constructed separately for individual results, strings of different lengths can produce different dtypes.

## The same string kind can have different capacities

Two synthetic records make the difference explicit:

```python
import numpy as np

a = np.array(["ok"])
b = np.array(["retry"])

assert a.dtype == np.dtype("U2")
assert b.dtype == np.dtype("U5")
assert a.dtype != b.dtype

merged = np.concatenate([a, b])
assert merged.dtype == np.dtype("U5")
assert merged.tolist() == ["ok", "retry"]
```

On a typical little-endian system, the two dtypes display as `<U2` and `<U5`. `U` denotes a fixed-width Unicode string, the number gives its capacity in Unicode code points, and the prefix describes byte order. They have the same kind but different capacities. [NumPy's string documentation](https://numpy.org/doc/stable/user/basics.strings.html#fixed-width-data-types) explains this representation.

The type rules imply the following contents. The table omits byte-order prefixes; it is not a new execution log.

| Object | Contents | dtype | Capacity per element |
|---|---|---|---:|
| `a` | `["ok"]` | `U2` | 2 code points |
| `b` | `["retry"]` | `U5` | 5 code points |
| `merged` | `["ok", "retry"]` | `U5` | 5 code points |

An exact dtype-equality check therefore rejects this pair of inputs, while [`np.concatenate`](https://numpy.org/doc/stable/reference/generated/numpy.concatenate.html) itself can choose a sufficiently wide result type. Our failure was an overly strict pre-concatenation check, not an inability of NumPy to concatenate strings of different lengths.

## Aligning to a narrower dtype loses content

Once a capacity mismatch is identified, it is still unsafe to pick an arbitrary dtype and cast every input to it. If we use the first record's `U2`, the second record will no longer fit:

```python
narrow = b.astype("U2")
assert narrow.dtype == np.dtype("U2")
assert narrow.tolist() == ["re"]
assert b.tolist() == ["retry"]
assert not np.can_cast(b.dtype, narrow.dtype, casting="safe")
```

`retry` has five code points; `U2` retains only the first two. The dtypes now look aligned, but the contents are already wrong. [`astype` defaults to the `unsafe` casting rule](https://numpy.org/doc/stable/reference/generated/numpy.ndarray.astype.html), so the absence of an exception is not evidence that the contents survived intact.

The last assertion checks the safe-casting relationship between two dtypes. Values representable by `U5` do not necessarily fit in `U2`, so this narrowing is not allowed under `safe`. The check does not depend on whether a particular string happens to be short.

## Allow safe widening only within the same string kind

We relaxed only this case: increasing capacity when both inputs have kind `U`, or both have kind `S`. The capacity of `S` is measured in bytes. Mixed Unicode and byte-string inputs should still follow the interface's rules, without casually changing their meaning.

Before relaxing the check, also establish that capacity is not a business-defined maximum length. If a field is genuinely limited to two code points, `retry` should be rejected at entry; widening it to `U5` would change the contract. This discussion covers valid contents rejected only because separate batches inferred different capacities.

The helper below handles a nonempty list whose items are one-dimensional string arrays for the same field. It first chooses a common dtype and aligns the inputs, before validation and concatenation that require a uniform dtype:

```python
def widen_text_column(parts):
    if not parts or any(x.ndim != 1 for x in parts):
        raise ValueError("expected a nonempty list of 1-D arrays")
    kinds = {x.dtype.kind for x in parts}
    if len(kinds) != 1 or not kinds <= {"U", "S"}:
        raise TypeError("expected one fixed-width string kind")
    common = np.result_type(*(x.dtype for x in parts))
    return [x.astype(common, casting="safe", copy=False) for x in parts]

normalized = widen_text_column([a, b])
assert all(x.dtype == np.dtype("U5") for x in normalized)
joined = np.concatenate(normalized)
assert joined.tolist() == ["ok", "retry"]
assert a.dtype == np.dtype("U2") and a.tolist() == ["ok"]
assert b.dtype == np.dtype("U5") and b.tolist() == ["retry"]
```

[`np.result_type`](https://numpy.org/doc/stable/reference/generated/numpy.result_type.html) applies the promotion rules to choose a common type. With fixed-width strings on both sides, this gives the wider capacity that accommodates both. A [`safe` cast](https://numpy.org/doc/stable/reference/generated/numpy.can_cast.html) then restricts conversion to one that can preserve values. `copy=False` does not change a dtype in place; a result array is still needed when wider storage is required.

The original schema must first permit this limited capacity adjustment. If it insists on `U2 == U5` before reaching this step, the code never runs. Conversely, an interface that already accepts NumPy's type promotion needs no extra alignment.

## Check contents while retaining the other guards

Error messages benefit from separating the layers too: record the field name, shape, string kind, and full dtype. “Both are strings” omits capacity, while “dtypes differ” does not explain whether they can be aligned safely. A clear rejection reason helps determine whether the contents need checking or the type rule needs correction.

This helper does not replace the whole batch-assembly interface. Field sets, correspondence between members across columns, numerical field dtypes, and missing-value conventions remain the original interface's responsibility. The example is limited to one-dimensional columns; higher-dimensional inputs must also agree in shape outside the concatenation axis.

Regression cases should include equal-width strings, different-width strings of the same kind, and sufficiently long values, checking both the full contents and their order after merging. Mixed `U`/`S` inputs, numerical dtype mismatches, missing fields, and invalid shapes must continue to follow their respective rejection rules.

Casting every field to `object` gives strings, numbers, and accidentally mixed-in objects the same dtype, making dtype equality alone less useful for distinguishing them. Object arrays can be a deliberate representation choice, but are not a general patch for bypassing schema checks.

This discussion covers fixed-width `U` and `S`. The variable-width `StringDType` introduced in NumPy 2.0 uses a different representation and needs separate consideration. Separating incompatible types from different capacities within the same string kind protects both valid data and useful checks.
