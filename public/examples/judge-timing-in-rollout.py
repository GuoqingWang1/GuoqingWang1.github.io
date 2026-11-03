#!/usr/bin/env python3
"""Arithmetic on synthetic intervals, not a Judge performance measurement.

All timestamps below are fixed Decimal values sharing one artificial origin.
This script does not sleep, read clocks, send requests, or run any service.
"""

from decimal import Decimal
import json
import platform


def duration(interval):
    start, end = interval
    if end < start:
        raise ValueError("interval ends before it starts")
    return end - start


def contains(outer, inner):
    return outer[0] <= inner[0] and inner[1] <= outer[1]


def overlap_duration(left, right):
    return max(Decimal("0"), min(left[1], right[1]) - max(left[0], right[0]))


def main():
    checks = []

    def check(name, condition):
        if not bool(condition):
            raise AssertionError(name)
        checks.append(name)

    intervals = {
        "A_generate": (Decimal("0"), Decimal("2")),
        "A_judge": (Decimal("2"), Decimal("5")),
        "B_generate": (Decimal("0"), Decimal("1")),
        "B_judge": (Decimal("1"), Decimal("4")),
        "driver_generate": (Decimal("0"), Decimal("5")),
        "driver_reward": (Decimal("5"), Decimal("5.01")),
    }
    a_generate = intervals["A_generate"]
    a_judge = intervals["A_judge"]
    b_generate = intervals["B_generate"]
    b_judge = intervals["B_judge"]
    driver_generate = intervals["driver_generate"]
    driver_reward = intervals["driver_reward"]
    elapsed = {name: duration(interval) for name, interval in intervals.items()}

    check("A_judge_starts_after_its_generation", a_generate[1] == a_judge[0])
    check("B_judge_starts_after_its_generation", b_generate[1] == b_judge[0])
    check("A_worker_total_is_5_seconds", elapsed["A_generate"] + elapsed["A_judge"] == Decimal("5"))
    check("B_worker_total_is_4_seconds", elapsed["B_generate"] + elapsed["B_judge"] == Decimal("4"))
    check("driver_waits_for_last_worker", driver_generate[1] == max(a_judge[1], b_judge[1]))
    check("A_judge_is_inside_driver_generate", contains(driver_generate, a_judge))
    check("B_judge_is_inside_driver_generate", contains(driver_generate, b_judge))
    check("both_generation_spans_are_inside_driver_generate", contains(driver_generate, a_generate) and contains(driver_generate, b_generate))
    check("each_judge_duration_is_3_seconds", elapsed["A_judge"] == elapsed["B_judge"] == Decimal("3"))

    request_sum = elapsed["A_judge"] + elapsed["B_judge"]
    judge_overlap = overlap_duration(a_judge, b_judge)
    judge_union = request_sum - judge_overlap
    check("cumulative_judge_request_time_is_6_seconds", request_sum == Decimal("6"))
    check("judge_overlap_is_2_seconds", judge_overlap == Decimal("2"))
    check("judge_overlap_runs_from_2_to_4", max(a_judge[0], b_judge[0]) == Decimal("2") and min(a_judge[1], b_judge[1]) == Decimal("4"))
    check("judge_union_is_4_seconds", judge_union == Decimal("4"))
    check("cumulative_time_exceeds_generate_wall_interval", request_sum > elapsed["driver_generate"])

    driver_sum = elapsed["driver_generate"] + elapsed["driver_reward"]
    driver_wall = driver_reward[1] - driver_generate[0]
    check("reward_starts_when_generate_finishes", driver_reward[0] == driver_generate[1])
    check("driver_intervals_do_not_overlap", overlap_duration(driver_generate, driver_reward) == Decimal("0"))
    check("driver_generate_is_5_seconds", elapsed["driver_generate"] == Decimal("5"))
    check("driver_reward_is_0_01_seconds", elapsed["driver_reward"] == Decimal("0.01"))
    check("driver_wall_is_5_01_seconds", driver_wall == Decimal("5.01"))
    check("adjacent_driver_intervals_sum_to_wall_time", driver_sum == driver_wall)

    double_counted = driver_sum + request_sum
    longest_judge = max(elapsed["A_judge"], elapsed["B_judge"])
    check("adding_contained_judge_time_double_counts_6_seconds", double_counted - driver_wall == Decimal("6"))
    check("incorrect_added_total_is_11_01_seconds", double_counted == Decimal("11.01"))
    check("longest_judge_is_not_driver_generate_time", longest_judge == Decimal("3") and longest_judge != elapsed["driver_generate"])

    print(json.dumps({
        "python_version": platform.python_version(),
        "scope": "fixed synthetic intervals and exact decimal arithmetic; no actual Judge timing",
        "check_count": len(checks),
        "checks": checks,
        "observed": {
            "time_source": "hard-coded synthetic seconds with a shared clock origin",
            "intervals_seconds": {
                name: {"start": str(start), "end": str(end), "duration": str(elapsed[name])}
                for name, (start, end) in intervals.items()
            },
            "judge_request_sum_seconds": str(request_sum),
            "judge_overlap_seconds": str(judge_overlap),
            "judge_union_seconds": str(judge_union),
            "driver_generate_seconds": str(elapsed["driver_generate"]),
            "driver_reward_seconds": str(elapsed["driver_reward"]),
            "driver_wall_seconds": str(driver_wall),
            "incorrect_double_counted_total_seconds": str(double_counted),
            "longest_judge_seconds": str(longest_judge),
        },
    }, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
