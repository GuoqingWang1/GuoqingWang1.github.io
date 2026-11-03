---
title: "When a test fails early, check where the input was rejected"
description: "When invalid input is rejected at an unexpected stage, distinguish a regression from an outdated test fixture."
category: technical
lang: en
translationKey: test-rejection-stage
topic: training
tags: [测试, 输入校验, padding]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 8
draft: false
review: true
---

A negative test usually aims to confirm that invalid input is rejected. But “the input was rejected” and “the test passed” do not always mean the same thing: the test may also require a particular stage to raise a particular message.

One padding negative case ran into exactly this situation. The test expected rejection at a later validation stage, but an existing consistency check fired while materializing the training view. The guard was already doing its job, while the fixture still marked the outcome as a failure. What needed correction was the expected rejection location and message.

## Verify the actual reason for rejection

Suppose processing proceeds through input construction, view materialization, a post-check, and then computation. Once an earlier step rejects the input, the later checks do not run.

When a test reports that the expected error did not occur, follow the traceback to the actual failure location. It could be the same constraint taking effect earlier, but it could also be a misspelled field, a missing dependency, or an entirely unrelated exception. Only the first case supports adjusting this negative test's expectation.

An earlier error is not, by itself, proof of correctness. Confirm that the rejected condition is the one the negative case intended to violate, and that valid input still has a path through. Otherwise, changing the expectation to match the current error simply conceals another problem.

There is also a contract assumption: the interface permits this input to be rejected at a valid boundary before computation. If the error's stage, type, or format is itself part of the external contract, changing it may still break compatibility. “It did not reach computation anyway” is not sufficient grounds to accept that change.

## Record the reason and stage separately

Here is an independent, reduced example, not the historical production code. The input must be a three-element list whose last position is padding and must be zero. Materialization turns it into a view with a `mask` field. The exception's `stage` identifies where rejection occurs, while its type identifies the violated condition.

```python
import pytest

class InvalidPadding(ValueError):
    def __init__(self, stage):
        self.stage = stage
        super().__init__("padding must be masked out")

def materialize(mask):
    if not isinstance(mask, list) or len(mask) != 3:
        raise TypeError("expected a three-element list")
    if mask[-1] != 0:
        raise InvalidPadding("materialize")
    return {"mask": tuple(mask)}

def postcheck(view):
    if view["mask"][-1] != 0:
        raise InvalidPadding("postcheck")
    return view

def process(mask):
    return postcheck(materialize(mask))
```

For `process([1, 1, 1])`, `materialize` rejects the last position first, so `postcheck` never runs. An old fixture requiring this call to report `stage == "postcheck"` would fail, but that does not imply that invalid padding reached the computation.

`process(None)` fails for a different reason: its input shape violates the example's interface and raises `TypeError`. That does not validate the padding rule. If a fixture meant to test padding accidentally constructs `None`, an exception alone does not mean the intended condition was tested.

[`pytest.raises()`](https://docs.pytest.org/en/stable/how-to/assert.html#assertions-about-expected-exceptions) retains the exception object for further inspection. When a test relies on an error message, `match` is also available, but it performs a regular-expression match rather than automatically checking full-string equality. Stable error types and structured reasons are usually easier to maintain. Whether the stage should also be fixed depends on the test's purpose.

## Preserve the original constraint when updating the fixture

There are two different testing tasks here. An integration negative case cares that invalid input is properly rejected before computation, and should accept rejection at a boundary allowed by the contract. A unit test targeting a specific later check should test that check directly or construct input that can reach it.

Using the functions above, the valid control, integration negative case, and direct unit test of the later check can be written separately:

```python
# Valid input passes through both checks and produces the expected view.
assert process([1, 1, 0]) == {"mask": (1, 1, 0)}

# The integration negative case is rejected earlier, during materialization.
with pytest.raises(InvalidPadding) as early:
    process([1, 1, 1])
assert early.value.stage == "materialize"

# Test the later check directly; the invalid view need not pass earlier guards.
with pytest.raises(InvalidPadding) as late:
    postcheck({"mask": (1, 1, 1)})
assert late.value.stage == "postcheck"

# An invalid shape is a separate contract, not a padding negative case.
with pytest.raises(TypeError, match=r"^expected a three-element list$"):
    process(None)
```

The third check passes `postcheck` a view containing only the necessary field, isolating that function's own rule. It does not show that this invalid view can reach the later stage through the production entry point, nor does it require disabling the earlier guard. The first check preserves the complete valid path; the second verifies that the entry point rejects invalid input. The third cannot replace either of them.

Prefer a valid control that differs from the negative case only in the condition under test. Here both inputs are three-element lists, with only the last value changing from `0` to `1`. If the container type, length, and padding value all change at once, one exception is insufficient to establish which rule took effect. The direct post-check test should retain the same minimal view structure too.

When adjusting the expectation, retain three requirements: the exception must correspond to the invalid condition being tested; valid control input must not be rejected along with it; and unknown or unrelated errors must not be swallowed by a broad `except Exception`.

In the actual issue described earlier, the change was confined to the fixture's expectation. The production computation path was unchanged, and the CPU suite was not rerun at that time. Confirming the scope of a diff or its syntactic validity only establishes what changed; it cannot establish fresh acceptance of the full chain. Recording the expectation correction and execution validation separately helps prevent weakening safeguards just to turn a red test green.

## Run the example locally

[Download the complete script](/examples/test-rejection-stage.py). On 2026-11-03, 15 checks passed with **Python 3.11.11 on a macOS arm64 CPU**. The download uses only the standard library. The two article blocks were also assembled in order and executed successfully with **pytest 8.3.5**.

```sh
python test-rejection-stage.py
```

Valid input called `postcheck` once. Invalid padding was rejected in `materialize`, with zero calls to `postcheck`. Directly testing the later guard still produced `stage="postcheck"`. The shape error from `None` and the unrelated missing-field `KeyError` were not accepted as successful padding tests. See the [recorded output](/examples/cpu-verification-more.json).

This checks the article's synthetic functions and their corresponding tests. It does not rerun the historical production fixture or complete training suite. The earlier statement that the CPU suite was not rerun at that time remains a historical fact.
