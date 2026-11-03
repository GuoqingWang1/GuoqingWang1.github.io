#!/usr/bin/env python3
"""Synthetic dictionary checks, not a checkpoint or training-framework replay.

Uses only the Python standard library. No checkpoint, file, network, or model is
loaded. The active-schema helpers match the reduced example in the article.
"""

from copy import deepcopy
import json
import platform


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
    return validate_record(saved)


def join_records(cached_rows, fresh_rows):
    rows = cached_rows + fresh_rows
    for row in rows:
        validate_record(row)
    return rows


def expect_error(error_type, operation, message):
    try:
        operation()
    except error_type as error:
        if str(error) != message:
            raise AssertionError("unexpected rejection message") from error
        return error
    raise AssertionError(f"expected {error_type.__name__}")


def main():
    checks = []
    originals = []

    def check(name, condition):
        if not bool(condition):
            raise AssertionError(name)
        checks.append(name)

    def remember(name, row):
        originals.append((name, row, deepcopy(row)))

    cached = {"sample_id": "old-1", "reward": 0.0, "trace": {"schema": 1}}
    fresh = {"sample_id": "new-1", "reward": 0.0, "trace": {"schema": 1}}
    damaged = {key: value for key, value in cached.items() if key != "trace"}
    remember("cached", cached)
    remember("fresh", fresh)
    remember("damaged", damaged)

    check("saved_and_fresh_fields_match", set(cached) == set(fresh) == EXPECTED_FIELDS)
    check("damaged_and_fresh_fields_differ", set(damaged) != set(fresh))

    before = deepcopy(cached)
    independent_snapshot = before is not cached and before["trace"] is not cached["trace"]
    check("snapshot_is_independent_including_nested_trace", independent_snapshot)

    restored = restore_active_record(cached)
    batch = join_records([restored], [fresh])
    check("mixed_batch_keeps_both_members", len(batch) == 2)
    check("mixed_batch_preserves_order", [row["sample_id"] for row in batch] == ["old-1", "new-1"])
    check("mixed_batch_preserves_rewards", [row["reward"] for row in batch] == [0.0, 0.0])
    check("mixed_batch_preserves_trace_versions", [row["trace"] for row in batch] == [{"schema": 1}, {"schema": 1}])
    check("restored_member_matches_independent_snapshot", batch[0] == before)
    check("saved_record_matches_independent_snapshot", cached == before)

    mixed_error = expect_error(
        ValueError,
        lambda: join_records([damaged], [fresh]),
        "record fields do not match the active schema",
    )
    check("damaged_cached_member_is_rejected_in_mixed_batch", type(mixed_error) is ValueError)

    damaged_peer = deepcopy(damaged)
    damaged_peer["sample_id"] = "old-2"
    remember("damaged_peer", damaged_peer)
    check("all_damaged_members_can_agree_on_fields", set(damaged) == set(damaged_peer))
    damaged_only_error = expect_error(
        ValueError,
        lambda: join_records([damaged, damaged_peer], []),
        "record fields do not match the active schema",
    )
    check("agreement_does_not_bypass_active_schema", type(damaged_only_error) is ValueError)

    # Each invalid record isolates one reason for rejection.
    missing_reward = deepcopy(cached)
    del missing_reward["reward"]
    extra_field = deepcopy(cached)
    extra_field["extra"] = "unexpected"
    missing_trace = deepcopy(cached)
    del missing_trace["trace"]
    invalid_cases = [
        ("missing_trace_field", missing_trace, "record fields do not match the active schema"),
        ("missing_reward_field", missing_reward, "record fields do not match the active schema"),
        ("unknown_extra_field", extra_field, "record fields do not match the active schema"),
    ]
    for name, trace in [
        ("null_trace", None),
        ("missing_version", {}),
        ("incompatible_version", {"schema": 2}),
        ("boolean_version", {"schema": True}),
        ("string_version", {"schema": "1"}),
    ]:
        row = deepcopy(cached)
        row["trace"] = trace
        message = "missing required trace" if trace is None else "trace schema mismatch"
        invalid_cases.append((name, row, message))

    for name, row, message in invalid_cases:
        remember(name, row)
        error = expect_error(ValueError, lambda row=row: restore_active_record(row), message)
        check(f"reject_{name}_at_restore", type(error) is ValueError)

    invalid_fresh = deepcopy(fresh)
    invalid_fresh["trace"]["schema"] = 2
    remember("invalid_fresh", invalid_fresh)
    fresh_error = expect_error(
        ValueError,
        lambda: join_records([restored], [invalid_fresh]),
        "trace schema mismatch",
    )
    check("fresh_members_are_validated_too", type(fresh_error) is ValueError)

    changed = [name for name, row, snapshot in originals if row != snapshot]
    check("accepted_and_rejected_inputs_are_unchanged", not changed)

    print(json.dumps({
        "python_version": platform.python_version(),
        "scope": "synthetic active-schema dictionaries only; no checkpoint or framework execution",
        "check_count": len(checks),
        "checks": checks,
        "observed": {
            "saved_fields": sorted(cached),
            "damaged_fields": sorted(damaged),
            "fresh_fields": sorted(fresh),
            "batch_sample_ids": [row["sample_id"] for row in batch],
            "batch_rewards": [row["reward"] for row in batch],
            "batch_trace_versions": [row["trace"]["schema"] for row in batch],
            "independent_snapshot": independent_snapshot,
            "damaged_mixed_batch_error": str(mixed_error),
            "inputs_checked_unchanged": len(originals),
            "changed_inputs": changed,
            "not_checked": [
                "checkpoint deserialization and framework entry points",
                "dtype, tensor shape, identifier uniqueness, and ownership",
                "feature-disabled migration and training quality",
            ],
        },
    }, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
