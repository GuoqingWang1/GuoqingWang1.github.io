---
title: "When a test fails early, check where the input was rejected"
description: "When invalid input is rejected at an unexpected stage, distinguish a regression from an outdated test fixture."
category: technical
lang: en
translationKey: test-rejection-stage
topic: training
tags: [测试, 输入校验, padding]
pubDate: "2026-11-01T06:32:29+08:00"
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

## Record the reason and stage separately

Here is an independent, reduced example: the last position in a mask is designated as padding and must be zero. The exception's `stage` attribute identifies where rejection occurs, while its type identifies the violated condition.

```python
import pytest

class InvalidPadding(ValueError):
    def __init__(self, stage):
        self.stage = stage
        super().__init__("padding must be masked out")

def materialize(mask):
    if mask[-1] != 0:
        raise InvalidPadding("materialize")
    return mask

with pytest.raises(InvalidPadding) as exc:
    materialize([1, 1, 1])

assert exc.value.stage == "materialize"
```

If an old fixture instead asserts `stage == "postcheck"` on the last line, it fails. That does not imply that invalid padding reached the computation. The input was already rejected in `materialize`; requiring it to trigger a later error does not match the execution path.

[`pytest.raises()`](https://docs.pytest.org/en/stable/how-to/assert.html#assertions-about-expected-exceptions) retains the exception object for further inspection. When a test relies on an error message, `match` is also available, but it performs a regular-expression match rather than automatically checking full-string equality. Stable error types and structured reasons are usually easier to maintain. Whether the stage should also be fixed depends on the test's purpose.

## Preserve the original constraint when updating the fixture

There are two different testing tasks here. An integration negative case cares that invalid input is properly rejected before computation, and should accept rejection at a boundary allowed by the contract. A unit test targeting a specific later check should test that check directly or construct input that can reach it. Do not disable a correct earlier guard merely to reach a later one.

When adjusting the expectation, retain three requirements: the exception must correspond to the invalid condition being tested; valid control input must not be rejected along with it; and unknown or unrelated errors must not be swallowed by a broad `except Exception`.

In the actual issue described earlier, the change was confined to the fixture's expectation; it did not alter the production computation path. Confirming the scope of a diff or its syntactic validity only establishes what changed. Whether a fresh execution check passes still requires its own result. Keeping “the assertion was corrected” separate from “the full chain was accepted” helps prevent weakening safeguards just to turn a red test green.
