---
title: "String Width Is Part of dtype: A Schema Check That Rejected a Valid Batch"
description: "Distinguishing different fixed-width string capacities from genuinely incompatible field types."
category: technical
lang: en
translationKey: numpy-string-dtype-width
topic: training
tags: [NumPy, 数据类型, 合批]
pubDate: "2026-11-01T06:32:29+08:00"
order: 5
draft: false
review: true
---

A smoke test of a training pipeline stopped during batch assembly because of a non-tensor field. The field contained strings in both inputs, and neither its name nor its structure had changed, yet strict validation reported a dtype mismatch.

The error came from our own schema check: it required the two NumPy dtypes to be exactly equal. For fixed-width strings, however, the dtype also includes capacity. When arrays are constructed separately for individual results, strings of different lengths can produce different dtypes.

## The same string kind can have different capacities

Consider a small, independent example:

```python
import numpy as np

a = np.array(["ok"])
b = np.array(["retry"])

print(a.dtype, b.dtype)
merged = np.concatenate([a, b])
```

On a typical little-endian system, the two dtypes are represented as `<U2` and `<U5`. Here, `U` denotes a fixed-width Unicode string, and the number gives its maximum capacity in Unicode code points; the prefix describes byte order. Thus, `a.dtype == b.dtype` being false does not mean the two columns cannot be combined. [NumPy's string documentation](https://numpy.org/doc/stable/user/basics.strings.html#fixed-width-data-types) explains this representation.

The [`np.concatenate`](https://numpy.org/doc/stable/reference/generated/numpy.concatenate.html) call above can choose a sufficiently wide result type. Our failure happened before that call: the validation layer treated different string capacities as incompatible. This should not be described as “NumPy cannot concatenate arrays containing strings of different lengths.”

Byte strings have a similar property, as with `S2` and `S5`, but their capacity is measured in bytes. Unicode strings and byte strings have different meanings and should remain distinct in the fix.

## Allow widening only within the same string kind

We kept the change narrow: permit lossless widening when both arrays have kind `U`, or both have kind `S`, while retaining the other type and structure checks.

If an interface does need string-column dtypes to be aligned first, the two arrays above can illustrate the sequence explicitly:

```python
parts = [a, b]  # Already verified as 1-D arrays for the same field
kinds = {x.dtype.kind for x in parts}
if len(kinds) != 1 or not kinds <= {"U", "S"}:
    raise TypeError("expected one fixed-width string kind")

common = np.result_type(*(x.dtype for x in parts))
normalized = [
    x.astype(common, casting="safe", copy=False) for x in parts
]
merged = np.concatenate(normalized)
```

[`np.result_type`](https://numpy.org/doc/stable/reference/generated/numpy.result_type.html) chooses a common type using NumPy's promotion rules; a [`safe` cast](https://numpy.org/doc/stable/reference/generated/numpy.can_cast.html) must be able to preserve the values. Width alignment belongs at the point permitted by the validation layer. If the old exact-equality check rejects the inputs first, concatenation never gets the chance to help.

This code illustrates the handling of one fixed-width string column. It is not a drop-in replacement for a framework's batch-assembly function. The original interface must still check field sets, shapes outside the concatenation axis, numerical field dtypes, and missing-value conventions. If the interface already accepts NumPy's type promotion, this extra conversion is unnecessary.

Converting every field to `object` may look simpler, but strings, numbers, and accidentally mixed-in objects would then all have the same dtype, making them harder for the original type check to distinguish. Whether to use an object array should follow from the intended data representation.

## Regression cases should cover the validation boundary

This repair deserves at least a few cases: equal-width strings still pass; different-width strings of the same kind retain their full contents after concatenation; numerical dtype mismatches are still rejected; and field or shape errors are still rejected. Include a longer string as well, to check that an overly narrow dtype chosen in advance has not truncated the result.

This discussion concerns fixed-width `U` and `S` arrays. NumPy has also provided the variable-width `StringDType` since version 2.0, so the rule should not be applied indiscriminately to every string representation.

When investigating this kind of error, separate incompatible field types from different capacities within the same string kind. That allows valid batches through while preserving useful checks.
