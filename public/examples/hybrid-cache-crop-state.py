#!/usr/bin/env python3
"""Standard-library-only checks of the article's integer/list ToyCache.

This is not a model or Transformers cache implementation. Its recurrence is
invented for illustration. Results do not measure real cache contamination,
model outputs, tensor-storage isolation, or support for any copying API.
"""

import json
import platform


class ToyCache:
    def __init__(self):
        self.slots = []
        self.state = 0

    def append(self, value):
        self.slots.append(value)
        self.state = 10 * self.state + value

    def crop(self, length):
        self.slots = self.slots[:length]


def snapshot(cache):
    # Copy the list for reporting; later toy mutations must not rewrite history.
    return {"slots": list(cache.slots), "state": cache.state}


def from_values(values):
    cache = ToyCache()
    for value in values:
        cache.append(value)
    return cache


def main():
    checks = []
    observed = {}

    def check(name, passed):
        checks.append({"name": name, "passed": bool(passed)})

    empty = ToyCache()
    check("new_toy_is_empty", empty.slots == [] and empty.state == 0)
    empty.crop(0)
    check("cropping_empty_toy_keeps_empty_state", empty.slots == [] and empty.state == 0)

    reused = from_values([1, 2])
    stages = [{"stage": "prefix", **snapshot(reused)}]
    check("prefix_state", reused.slots == [1, 2] and reused.state == 12)
    reused.append(3)
    stages.append({"stage": "append_a", **snapshot(reused)})
    check("continuation_a_state", reused.slots == [1, 2, 3] and reused.state == 123)
    reused.crop(2)
    stages.append({"stage": "crop_to_prefix_length", **snapshot(reused)})
    check("crop_restores_list_length", len(reused.slots) == 2)
    check("crop_restores_list_contents", reused.slots == [1, 2])
    check("crop_does_not_restore_recurrent_state", reused.state == 123 and reused.state != 12)
    reused.append(4)
    stages.append({"stage": "append_b_after_crop", **snapshot(reused)})
    fresh = from_values([1, 2, 4])
    stages.append({"stage": "fresh_prefix_then_b", **snapshot(fresh)})
    observed["article_stages"] = stages
    check("reused_final_state", reused.state == 1234)
    check("fresh_final_state", fresh.state == 124)
    check("same_final_slots", reused.slots == fresh.slots == [1, 2, 4])
    check("same_length_does_not_establish_same_state",
          len(reused.slots) == len(fresh.slots) and reused.state != fresh.state)

    independent_a = from_values([1, 2])
    independent_b = from_values([1, 2])
    independent_a.append(3)
    check("fresh_toy_objects_are_distinct", independent_a is not independent_b
          and independent_a.slots is not independent_b.slots)
    check("independent_b_still_has_prefix", independent_b.slots == [1, 2]
          and independent_b.state == 12)
    independent_b.append(4)
    observed["independent_toys"] = {"a": snapshot(independent_a), "b": snapshot(independent_b)}
    check("independent_continuations", independent_a.slots == [1, 2, 3]
          and independent_a.state == 123 and independent_b.slots == [1, 2, 4]
          and independent_b.state == 124)

    # Aliases are deliberately the same Python toy object, not copied model state.
    alias_a = from_values([1, 2])
    alias_b = alias_a
    check("aliases_share_the_toy_object", alias_a is alias_b)
    alias_a.append(3)
    alias_after_append = snapshot(alias_b)
    check("alias_append_is_visible_to_b", alias_b.slots == [1, 2, 3] and alias_b.state == 123)
    alias_b.crop(2)
    observed["shared_alias_toy"] = {
        "same_object": alias_a is alias_b,
        "b_after_a_append": alias_after_append,
        "a_after_b_crop": snapshot(alias_a),
    }
    check("alias_crop_is_visible_to_a", alias_a.slots == [1, 2] and alias_a.state == 123)

    zero_crop = from_values([1, 2])
    zero_crop.crop(0)
    observed["crop_zero"] = snapshot(zero_crop)
    check("crop_zero_is_not_reset", zero_crop.slots == [] and zero_crop.state == 12)
    zero_crop.append(4)
    new_b_only = from_values([4])
    observed["after_crop_zero_then_b"] = snapshot(zero_crop)
    observed["fresh_b_only"] = snapshot(new_b_only)
    check("empty_slots_can_hide_old_state", zero_crop.slots == new_b_only.slots == [4]
          and zero_crop.state == 124 and new_b_only.state == 4)
    check("saved_observations_do_not_alias_mutated_lists", stages[0]["slots"] == [1, 2]
          and stages[1]["slots"] == [1, 2, 3] and alias_after_append["slots"] == [1, 2, 3])

    print(json.dumps({
        "python_version": platform.python_version(),
        "scope": "Standard-library integer/list ToyCache and Python object aliases only; no PyTorch, Transformers, model, real KV cache, or tensor-storage validation.",
        "check_count": len(checks),
        "checks": checks,
        "observed": observed,
    }, indent=2, allow_nan=False))
    return 0 if all(item["passed"] for item in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
