#!/usr/bin/env python3
"""CPU-only synthetic demo of fixed-width NumPy strings, not a production patch.

Requires only NumPy and the Python standard library. No files, network, models,
or real training records are read. Successful checks are printed as JSON.
"""

import json
import platform

import numpy as np


def widen_text_column(parts):
    """Align a nonempty list of 1-D arrays within one fixed-width string kind."""
    if not parts or any(x.ndim != 1 for x in parts):
        raise ValueError("expected a nonempty list of 1-D arrays")
    kinds = {x.dtype.kind for x in parts}
    if len(kinds) != 1 or not kinds <= {"U", "S"}:
        raise TypeError("expected one fixed-width string kind")
    common = np.result_type(*(x.dtype for x in parts))
    return [x.astype(common, casting="safe", copy=False) for x in parts]


def run_checks():
    checks = []
    originals = []

    def check(name, condition, observed=None):
        if not bool(condition):
            raise AssertionError(f"{name}: {observed!r}")
        result = {"name": name, "passed": True}
        if observed is not None:
            result["observed"] = observed
        checks.append(result)

    def expect_error(name, exception_type, operation):
        try:
            operation()
        except exception_type:
            check(name, True, {"exception": exception_type.__name__})
        except Exception as exc:
            raise AssertionError(
                f"{name}: expected {exception_type.__name__}, "
                f"got {type(exc).__name__}"
            ) from exc
        else:
            raise AssertionError(f"{name}: expected {exception_type.__name__}")

    def remember(name, parts):
        for index, array in enumerate(parts):
            originals.append((f"{name}[{index}]", array, array.copy()))

    # Exact dtype equality rejects this pair; NumPy concatenation accepts it.
    a = np.array(["ok"])
    b = np.array(["retry"])
    remember("unicode_widths", [a, b])
    check(
        "inferred_U2_and_U5",
        a.dtype == np.dtype("U2") and b.dtype == np.dtype("U5"),
        {"dtypes": [str(a.dtype), str(b.dtype)]},
    )
    check("strict_dtype_equality_would_reject", a.dtype != b.dtype)

    merged = np.concatenate([a, b])
    check(
        "numpy_concatenation_promotes_without_truncation",
        merged.dtype == np.dtype("U5") and merged.tolist() == ["ok", "retry"],
        {"dtype": str(merged.dtype), "values": merged.tolist()},
    )

    # astype defaults to unsafe casting: conversion succeeds but loses content.
    narrow = b.astype("U2")
    check(
        "default_unsafe_cast_truncates",
        narrow.dtype == np.dtype("U2") and narrow.tolist() == ["re"],
        {"dtype": str(narrow.dtype), "values": narrow.tolist()},
    )
    can_narrow_safely = bool(np.can_cast(b.dtype, narrow.dtype, casting="safe"))
    check("U5_to_U2_is_not_safe", not can_narrow_safely, can_narrow_safely)
    expect_error(
        "safe_narrowing_raises",
        TypeError,
        lambda: b.astype("U2", casting="safe"),
    )

    normalized = widen_text_column([a, b])
    check(
        "helper_aligns_to_U5",
        all(x.dtype == np.dtype("U5") for x in normalized),
        {"dtypes": [str(x.dtype) for x in normalized]},
    )
    joined = np.concatenate(normalized)
    check(
        "safe_widening_preserves_content_and_order",
        joined.tolist() == ["ok", "retry"],
        {"values": joined.tolist()},
    )

    same_width = [np.array(["go", "ok"]), np.array(["up"])]
    remember("same_width", same_width)
    same_width_result = np.concatenate(widen_text_column(same_width))
    check(
        "same_width_unicode",
        same_width_result.dtype == np.dtype("U2")
        and same_width_result.tolist() == ["go", "ok", "up"],
    )

    byte_parts = [np.array([b"ok"]), np.array([b"retry"])]
    remember("bytes", byte_parts)
    byte_result = np.concatenate(widen_text_column(byte_parts))
    check(
        "S2_and_S5_widen_within_bytes",
        byte_parts[0].dtype == np.dtype("S2")
        and byte_parts[1].dtype == np.dtype("S5")
        and byte_result.dtype == np.dtype("S5")
        and byte_result.tolist() == [b"ok", b"retry"],
        {"dtype": str(byte_result.dtype)},
    )

    # Include a supplementary code point and a combining mark, not just ASCII.
    long_text = "研究🔬e\u0301" * 40
    unicode_parts = [np.array(["短"]), np.array([long_text, "终"])]
    remember("long_unicode", unicode_parts)
    unicode_result = np.concatenate(widen_text_column(unicode_parts))
    check(
        "long_unicode_is_preserved_in_code_point_capacity",
        unicode_result.dtype == np.dtype(f"U{len(long_text)}")
        and unicode_result.tolist() == ["短", long_text, "终"],
        {"dtype": str(unicode_result.dtype), "long_value_code_points": len(long_text)},
    )

    # The list must be nonempty; individual 1-D arrays may contain zero elements.
    with_empty = [np.array([], dtype="U2"), np.array(["retry"])]
    remember("empty_member", with_empty)
    with_empty_result = np.concatenate(widen_text_column(with_empty))
    check(
        "empty_1D_member_is_allowed",
        with_empty_result.dtype == np.dtype("U5")
        and with_empty_result.tolist() == ["retry"],
    )

    all_empty = [np.array([], dtype="U2"), np.array([], dtype="U5")]
    remember("all_empty", all_empty)
    all_empty_result = np.concatenate(widen_text_column(all_empty))
    check(
        "all_empty_1D_members_are_allowed",
        all_empty_result.dtype == np.dtype("U5")
        and all_empty_result.shape == (0,),
    )

    expect_error("empty_list_is_rejected", ValueError, lambda: widen_text_column([]))

    mixed = [np.array(["ok"]), np.array([b"retry"])]
    remember("mixed_U_S", mixed)
    expect_error("mixed_U_S_is_rejected", TypeError, lambda: widen_text_column(mixed))

    numeric = [np.array([1, 2], dtype="int64")]
    remember("numeric", numeric)
    expect_error("numeric_dtype_is_rejected", TypeError, lambda: widen_text_column(numeric))

    objects = [np.array(["ok"], dtype=object)]
    remember("object", objects)
    expect_error("object_dtype_is_rejected", TypeError, lambda: widen_text_column(objects))

    two_dimensional = [np.array([["ok", "go"]])]
    remember("two_dimensional", two_dimensional)
    expect_error(
        "2D_shape_is_rejected", ValueError, lambda: widen_text_column(two_dimensional)
    )

    scalar = [np.array("ok")]
    remember("scalar", scalar)
    expect_error("0D_shape_is_rejected", ValueError, lambda: widen_text_column(scalar))

    # Check all original inputs after the successful and rejected operations above.
    changed = [
        name
        for name, array, snapshot in originals
        if array.dtype != snapshot.dtype
        or array.shape != snapshot.shape
        or not np.array_equal(array, snapshot)
    ]
    check(
        "all_original_inputs_unchanged",
        not changed,
        {"arrays_checked": len(originals), "changed": changed},
    )
    return checks


def main():
    checks = run_checks()
    print(
        json.dumps(
            {
                "python_version": platform.python_version(),
                "numpy_version": np.__version__,
                "check_count": len(checks),
                "checks": checks,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
