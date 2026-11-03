#!/usr/bin/env python3
"""Synthetic CPU-only GRPO normalization demo, not a training-framework patch.

Tested with Python 3.11.11 and PyTorch 2.6.0 on a macOS arm64 CPU.
All tensors are small, created locally, and explicitly placed on the CPU.
"""

import json
import platform

import torch


def raw_group_advantage(rewards):
    return (rewards - rewards.mean()) / (rewards.std(correction=1) + 1e-6)


@torch.no_grad()
def normalize_one_group(rewards):
    if rewards.ndim != 1 or rewards.numel() < 2:
        raise ValueError("expected a 1-D group with at least two rewards")
    if not rewards.is_floating_point():
        raise TypeError("rewards must be floating point")
    if not torch.isfinite(rewards).all():
        raise ValueError("non-finite rewards")

    advantage = raw_group_advantage(rewards)
    if not torch.isfinite(advantage).all():
        raise FloatingPointError("non-finite advantages")
    if torch.eq(rewards, rewards[0]).all():
        advantage = torch.zeros_like(advantage)
    return advantage


def diagnostic(rewards):
    mean = rewards.mean()
    std = rewards.std(correction=1)
    return {
        "dtype": str(rewards.dtype),
        "stored_reward": rewards[0].item(),
        "mean": mean.item(),
        "residual": (rewards[0] - mean).item(),
        "std": std.item(),
        "raw_advantages": raw_group_advantage(rewards).tolist(),
    }


def main():
    torch.set_num_threads(1)
    checks = []

    def check(name, condition):
        if not bool(condition):
            raise AssertionError(name)
        checks.append(name)

    def rejects(name, rewards, error_type):
        try:
            normalize_one_group(rewards)
        except error_type:
            checks.append(name)
        else:
            raise AssertionError(name)

    equal = torch.full((8,), -0.1, dtype=torch.float32, device="cpu")
    before = equal.clone()
    check("stored_rewards_exactly_equal", torch.eq(equal, equal[0]).all())
    corrected = normalize_one_group(equal)
    check("equal_group_exact_zero", torch.equal(corrected, torch.zeros_like(equal)))
    check("equal_input_unchanged", torch.equal(equal, before))
    check("dtype_and_device_preserved", corrected.dtype == equal.dtype and corrected.device == equal.device)

    near = equal.clone()
    near[-1] = torch.nextafter(near[-1], torch.full_like(near[-1], float("inf")))
    check("near_group_not_exactly_equal", not torch.eq(near, near[0]).all().item())
    check("near_group_within_allclose", torch.allclose(near, equal))
    near_before = near.clone()
    expected = raw_group_advantage(near)
    check("near_group_preserves_raw_result", torch.equal(normalize_one_group(near), expected))
    check("near_input_unchanged", torch.equal(near, near_before))

    mixed = torch.tensor([-1.0, 0.0, 0.5, 1.0], dtype=torch.float32, device="cpu")
    mixed_before = mixed.clone()
    check("mixed_group_preserves_raw_result", torch.equal(normalize_one_group(mixed), raw_group_advantage(mixed)))
    check("mixed_input_unchanged", torch.equal(mixed, mixed_before))

    for value in (-1.0, 0.0, 0.9, 1.0):
        rewards = torch.full((8,), value, dtype=torch.float32, device="cpu")
        check(f"constant_{value}_exact_zero", torch.equal(normalize_one_group(rewards), torch.zeros_like(rewards)))

    for name, value in (("nan", float("nan")), ("positive_inf", float("inf")), ("negative_inf", -float("inf"))):
        rejects(f"reject_{name}", torch.tensor([0.0, value], dtype=torch.float32, device="cpu"), ValueError)
    rejects("reject_single_member", torch.tensor([0.0], dtype=torch.float32, device="cpu"), ValueError)
    rejects("reject_empty_group", torch.empty(0, dtype=torch.float32, device="cpu"), ValueError)
    rejects("reject_integer_rewards", torch.tensor([0, 1], dtype=torch.int64, device="cpu"), TypeError)
    rejects("reject_non_vector", torch.zeros((2, 2), dtype=torch.float32, device="cpu"), ValueError)

    report = {
        "example": "grpo-equal-rewards-zero-advantage",
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "device": "cpu",
        "dtype": "float32",
        "torch_threads": torch.get_num_threads(),
        "std_correction": 1,
        "epsilon": 1e-6,
        "raw_fp32": diagnostic(equal),
        "same_stored_values_in_fp64": diagnostic(equal.to(torch.float64)),
        "corrected_advantages": corrected.tolist(),
        "nextafter_gap": (near[-1] - equal[-1]).item(),
        "check_count": len(checks),
        "checks": checks,
        "status": "passed",
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
