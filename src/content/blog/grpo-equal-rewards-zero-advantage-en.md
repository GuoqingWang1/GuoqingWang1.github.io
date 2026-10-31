---
title: "Why Aren’t GRPO Advantages Zero When Every Reward Is the Same?"
description: "How identical rewards can produce nonzero advantages, and why a fix must preserve reward differences of just one floating-point step."
category: technical
topic: model
lang: en
tags: [GRPO, PyTorch, 数值稳定性]
pubDate: "2026-11-01T05:12:52+08:00"
updatedDate: "2026-11-01T06:52:26+08:00"
draft: false
review: true
translationKey: grpo-equal-rewards-zero-advantage
---

While debugging a GRPO training run, we encountered a counterintuitive problem: all eight outputs in a group had exactly the same reward, yet every computed advantage was a small positive number.

The program did not crash or produce NaNs. A check that only asked whether training could finish would easily miss the problem. But under the definition of a group-relative advantage, these rewards express no preference between the samples, so their advantages should be zero.

The problem came from a small numerical detail: a rounding residual left by floating-point reductions was amplified by the normalization denominator.

## Start with a group of identical rewards

[Outcome-supervised GRPO](https://arxiv.org/html/2402.03300v3) constructs relative advantages from the rewards of multiple outputs for the same question. Here we consider an implementation with standard-deviation normalization enabled. A common form is:

```text
advantage[i] = (reward[i] - mean(reward)) / (std(reward) + eps)
```

Here, `reward[i]` is the scalar reward for output `i` that actually enters the estimator. It may contain a fractional score or penalty; it need not be limited to 0 and 1.

In exact arithmetic, if every reward equals the same value `c`, the mean is `c` and the standard deviation is zero. With a positive `eps` in the denominator, the advantage is therefore zero.

Our case involved eight identical FP32 rewards corresponding to the value usually written as `-0.1`. They did not merely look identical in the logs: they were elementwise exactly equal when used in the computation. The historical CPU reproduction recorded:

| Quantity | Value |
|---|---:|
| Actual stored value of each reward | `-0.10000000149011612` |
| Mean produced by the FP32 reduction | `-0.10000000894069672` |
| Reward minus mean | Approximately `7.45e-9` |
| Computed standard deviation | Approximately `7.97e-9` |
| Advantage with `eps = 1e-6` | Approximately `+0.00739` |

When the same stored values were converted to FP64 and recomputed in that reproduction, both the standard deviation and the advantage became zero. This helped establish the numerical source of this particular anomaly.

When investigating it, first confirm that the rewards entering the estimator are exactly equal, then inspect the mean, standard deviation, and advantage separately. The following is a simplified diagnostic example using only CPU tensors:

```python
import torch

r = torch.full((8,), -0.1, dtype=torch.float32, device="cpu")
assert torch.eq(r, r[0]).all().item()

mean = r.mean()
std = r.std(correction=1)
adv = (r - mean) / (std + 1e-6)

print("stored reward:", r[0].item())
print("mean:", mean.item())
print("residual:", (r[0] - mean).item())
print("std:", std.item())
print("advantage:", adv.tolist())
```

This example explicitly uses the sample-standard-deviation convention, `correction=1`; a production fix should preserve the original estimator’s statistical convention. The [`torch.std` documentation](https://docs.pytorch.org/docs/stable/generated/torch.std.html) explains this parameter. The table contains observations from the fixed environment used at the time, not a promise that this snippet produces those values everywhere. Different versions, devices, or reduction paths may produce different low-order digits—or zero directly.

## A small denominator amplifies the residual

FP32 cannot represent `-0.1` exactly, which explains its stored value. But all eight elements still held the same floating-point value. That fact alone does not explain a nonzero advantage. Additional error arose in the subsequent mean and standard-deviation reductions.

Floating-point addition is not associative, so mathematically equivalent computation paths need not produce bitwise-identical results. [PyTorch’s numerical-accuracy notes](https://docs.pytorch.org/docs/stable/notes/numerical_accuracy.html) explicitly discuss this limitation.

Let each stored reward be `c`, and let `delta` be the error of the computed mean relative to it. The route from that error to the advantage becomes explicit:

```text
computed_mean = c + delta
reward[i] - computed_mean = -delta
advantage[i] = -delta / (computed_std + eps)
```

Every member uses the same mean in its numerator, so this error shifts the whole group in the same direction. When the mean is slightly below `c`, all eight numerators become positive. That does not mean all eight outputs are better than the other outputs in their group.

Using the recorded values, `7.45e-9 / (7.97e-9 + 1e-6)` is approximately `7.39e-3`. The numerator is small, but so is the denominator. The nonzero standard deviation is also a result of that numerical reduction; it does not indicate differences between the original rewards.

`eps` makes the division defined when the standard deviation is zero, but it does not make the numerator exactly zero. Increasing `eps` would reduce this nonzero value while also changing the scaling of other low-variance groups. It does not directly enforce the requirement that exactly equal rewards produce zero advantages.

## Handle exactly equal rewards explicitly

Our fix retained the original estimator and added zeroing only for exactly equal-reward groups. Ordinary groups and nearly equal groups continued through the original computation path.

Below, `raw_group_advantage` contains the illustrative formula above; the wrapper only decides which results should be zeroed. The example takes one group of already-aggregated floating-point rewards with at least two members. Advantages are treated as fixed targets here and are not differentiated through.

```python
def raw_group_advantage(r):
    return (r - r.mean()) / (r.std(correction=1) + 1e-6)


@torch.no_grad()
def normalize_one_group(r):
    if r.ndim != 1 or r.numel() < 2:
        raise ValueError("expected a 1-D group with at least two rewards")
    if not r.is_floating_point():
        raise TypeError("rewards must be floating point")
    if not torch.isfinite(r).all():
        raise ValueError("non-finite rewards")

    adv = raw_group_advantage(r)
    if not torch.isfinite(adv).all():
        raise FloatingPointError("non-finite advantages")

    if torch.eq(r, r[0]).all():
        adv = torch.zeros_like(adv)
    return adv
```

Three details are easy to overlook.

First, compare the rewards that actually enter normalization, in their original dtype. Values formatted for logging, values converted to another precision, or sums recomputed with a different mask may change what is being compared.

Second, `torch.eq` tests exact numerical equality. Replacing it with `allclose`, or treating a standard deviation below some threshold as an equal-reward group, may erase small differences that are actually present.

Finally, this repair preserved the validity checks on both the inputs and the original outputs before zeroing. For example, a group of positive infinities can pass an elementwise equality check, but it should not become a valid zero advantage. Checking finiteness first prevents a zero tensor from concealing NaN/Inf inputs or nonfinite outputs.

In a training framework, upstream code must also establish complete group membership and preserve the original reward aggregation, mask, and token-broadcasting rules. If the interface returns both `advantages` and `returns`, check both; a repair must not inadvertently break storage sharing between outputs that originally shared it.

## Tests must also protect real, small differences

Testing one constant group is not enough. The patch must remove the anomaly without changing valid inputs unnecessarily.

| Test input | Property to check |
|---|---|
| Exactly equal rewards | Corresponding advantages are exactly zero |
| Rewards differing by one representable floating-point step | The group is not classified as exactly equal, and its original result is retained |
| Ordinary mixed rewards | Original outputs for non-equal groups are not rewritten by the patch |
| NaN/Inf in inputs or advantages | Reject explicitly; zeroing must not conceal the problem |
| Incomplete group membership | Upstream validation rejects it according to the expected group size |

For the second case, [`torch.nextafter`](https://docs.pytorch.org/docs/2.15/generated/torch.nextafter.html) can obtain the next representable value toward positive infinity. Adding an arbitrarily small decimal number may round back to the original value in the current dtype, leaving a supposedly “nearly equal” test with exactly equal rewards.

Using the functions above, we can express two complementary checks:

```python
equal = torch.full((8,), -0.1, dtype=torch.float32, device="cpu")
near = equal.clone()
near[-1] = torch.nextafter(
    near[-1], torch.full_like(near[-1], float("inf"))
)

# Only the last value moved; the group is no longer exactly equal.
assert not torch.eq(near, near[0]).all().item()
assert torch.allclose(near, equal)  # Default tolerances still consider them close

# Equal rewards become exactly zero; nearly equal rewards keep the original result.
assert torch.equal(normalize_one_group(equal), torch.zeros_like(equal))
before = near.clone()
expected = raw_group_advantage(near)
assert torch.equal(normalize_one_group(near), expected)
assert torch.equal(near, before)  # The patch must not rewrite input rewards
```

Near `-0.1`, adjacent FP32 values are approximately `7.45e-9` apart. The [default tolerance of `allclose`](https://docs.pytorch.org/docs/2.15/generated/torch.allclose.html) is approximately `1.01e-6` here, enough to include that difference. It can therefore answer “Are these close enough?” but cannot replace “Are the stored rewards exactly equal?” This check requires the nearly equal group to retain the original function’s result; it does not require identical low-order digits across every device.

This single-group function also cannot tell that a group intended to contain eight members arrived with only seven. Checks for group size, membership, and duplicate entries belong upstream. `r.numel() >= 2` is merely the example’s statistical precondition, not proof that a group is complete.

In subsequent validation of an actual training run, the equal-reward groups that were checked had both `advantages` and `returns` restored to exact zero. This zeroes the group-relative advantage component. Other loss terms such as KL, or optimizer state, may still affect parameter updates; it does not require the entire training step to make no update.

For this kind of normalization code, two complementary requirements are worth keeping in the test suite: **do not invent a relative advantage when there is no within-group difference, and do not casually erase a small difference that is actually present.**
