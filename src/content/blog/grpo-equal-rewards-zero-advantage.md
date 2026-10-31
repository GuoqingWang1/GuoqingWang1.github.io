---
title: "奖励完全一样，GRPO 的优势为什么不是零？"
description: "相同奖励如何留下非零优势，以及为什么修复时要保留只差一个浮点间隔的奖励差异。"
category: technical
topic: model
lang: zh-CN
tags: [GRPO, PyTorch, 数值稳定性]
pubDate: "2026-11-01T05:12:52+08:00"
updatedDate: "2026-11-01T06:52:26+08:00"
draft: false
review: true
---

调试一次 GRPO 训练时，我们遇到了一个反直觉的问题：同一组八条输出的奖励完全相同，算出来的优势却全是一个小的正数。

程序没有因此崩溃，也没有出现 NaN。如果只检查训练能不能跑完，这个问题很容易被漏掉。但在组内相对优势的定义下，这组奖励没有提供样本之间的偏好差异，优势应当为零。

问题出在一个很小的地方：浮点归约留下的舍入残差，被归一化的分母放大了。

## 从一组完全相同的奖励开始

[GRPO 的结果监督形式](https://arxiv.org/html/2402.03300v3)用同一问题下多条输出的奖励，构造组内相对优势。这里讨论启用了标准差归一化的实现，常见计算形式是：

```text
advantage[i] = (reward[i] - mean(reward)) / (std(reward) + eps)
```

其中，`reward[i]` 是第 `i` 条输出对应、实际进入估计器的标量奖励。它可能是小数评分或惩罚，不一定只有 0 和 1。

在精确算术里，如果所有奖励都等于同一个数 `c`，均值就是 `c`，标准差为零；加上正的 `eps` 后，优势自然是零。

我们当时遇到的是八个相同的 FP32 小数奖励，对应通常写作 `-0.1` 的值。它们不是仅仅在日志中看起来一样，而是在参与计算时逐元素精确相等。历史 CPU 复现中记录到：

| 量 | 数值 |
|---|---:|
| 每条奖励的实际存储值 | `-0.10000000149011612` |
| FP32 归约得到的均值 | `-0.10000000894069672` |
| 奖励减去均值 | 约 `7.45e-9` |
| 计算得到的标准差 | 约 `7.97e-9` |
| 使用 `eps = 1e-6` 得到的优势 | 约 `+0.00739` |

同一组已存储的数值转成 FP64 后重算，当时得到的标准差和优势都回到了零。这帮助我们确认了这一具体异常的数值来源。

排查时，先确认参与估计的奖励确实相等，再分别打印均值、标准差和优势。下面是一个仅使用 CPU 张量的简化诊断例子：

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

这里显式选择了 `correction=1`，即样本标准差的约定；实际修复应保留原估计器的统计约定。[`torch.std` 文档](https://docs.pytorch.org/docs/stable/generated/torch.std.html)说明了这个参数。表中的数字来自当时的固定环境，不是对这段代码在所有环境下的输出承诺；不同版本、设备或归约路径可能给出不同末位，也可能直接得到零。

## 很小的残差被分母放大

`-0.1` 无法用 FP32 精确表示，这解释了它的存储值。但八个元素仍然存成了同一个浮点数，不能仅凭这一点解释非零优势。额外的误差出现在后续的均值和标准差归约中。

浮点加法不满足结合律，数学上等价的计算路径不保证得到逐位一致的结果。[PyTorch 的数值说明](https://docs.pytorch.org/docs/stable/notes/numerical_accuracy.html)也专门提醒了这一点。

把每个已存储的奖励记作 `c`，将计算均值相对它的误差记作 `delta`，就能直接看到误差如何进入优势：

```text
computed_mean = c + delta
reward[i] - computed_mean = -delta
advantage[i] = -delta / (computed_std + eps)
```

每个成员的分子都使用同一个均值，因此这次误差给整组带来了相同的偏移。均值略小于 `c`，八个分子便都是正数；这不表示八个输出都比组内其他输出更好。

代入上面的记录，`7.45e-9 / (7.97e-9 + 1e-6)` 约为 `7.39e-3`。分子虽小，分母也很小。这里标准差同样非零，是那次归约的计算结果，不意味着原始奖励之间有差异。

`eps` 可以让零标准差时的除法有定义，却不会让分子自动成为精确的零。增大 `eps` 会缩小这个非零值，也会改变其它低方差组的缩放；这并没有直接落实“精确同奖组应当归零”的要求。

## 把精确同奖组作为明确分支

我们的修复保留了原估计器，只对精确同奖组补充归零处理。普通组和近似相等的组继续走原计算路径。

下面把前面的单组示意公式封装为 `raw_group_advantage`，修补函数只决定哪些结果应该归零。示例处理一组已经聚合好的浮点奖励，至少包含两个成员；优势在这里作为固定目标，不参与反向传播。

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

这里有三个容易漏掉的细节。

首先，判等使用的是实际参与归一化的奖励，以及原来的 dtype。日志显示值、额外转换精度后的值，或者用另一套 mask 重新求和的结果，都可能改变判断依据。

其次，`torch.eq` 判断精确的数值相等。不能直接换成 `allclose`，也不能把“标准差小于某个阈值”当作同奖组：这些做法可能连真实存在的微小差异一起抹掉。

最后，这次对既有实现的修补保留了输入和原输出的合法性检查，再做归零。例如一组正无穷也能通过逐元素判等，但不应成为合法的零优势。先检查有限性，可以避免用一个零张量盖住输入中的 NaN／Inf 或非有限输出。

接入真实训练框架时，还要由上游确认分组完整，并沿用原有的奖励聚合、mask 和 token 广播规则。如果接口同时返回 `advantages` 与 `returns`，两者都要检查；原来共享存储的输出也不能在修复中被无意拆开。

## 测试也要保护真正的微小差异

只测试一个常量组还不够。这个补丁既要消除异常，也要保证正常输入没有被误伤。

| 测试输入 | 应检查的性质 |
|---|---|
| 完全相同的奖励 | 对应优势严格为零 |
| 只差一个可表示浮点间隔的奖励 | 不被归入精确同奖组，保留原结果 |
| 普通混合奖励 | 非同奖组的原输出不被补丁改写 |
| 输入或优势含 NaN／Inf | 明确拒绝，不能用归零掩盖问题 |
| 分组不完整 | 由上游按预期组大小检查并拒绝 |

构造第二类输入时，可以用 [`torch.nextafter`](https://docs.pytorch.org/docs/2.15/generated/torch.nextafter.html) 向正无穷方向取得下一个可表示值。随手加一个很小的十进制数，可能在当前 dtype 下又舍入回原值，使“近似相等”测试实际仍是一组完全相同的数。

接着前面的函数，可以写出两个互补的检查：

```python
equal = torch.full((8,), -0.1, dtype=torch.float32, device="cpu")
near = equal.clone()
near[-1] = torch.nextafter(
    near[-1], torch.full_like(near[-1], float("inf"))
)

# 只移动了最后一个值，整组已经不再精确相等。
assert not torch.eq(near, near[0]).all().item()
assert torch.allclose(near, equal)  # 默认容差仍会认为两组接近

# 同奖组严格归零；近似同奖组必须保留原计算结果。
assert torch.equal(normalize_one_group(equal), torch.zeros_like(equal))
before = near.clone()
expected = raw_group_advantage(near)
assert torch.equal(normalize_one_group(near), expected)
assert torch.equal(near, before)  # 修补不能改写输入奖励
```

在 `-0.1` 附近，相邻 FP32 数的间隔约为 `7.45e-9`。[`allclose` 的默认容差](https://docs.pytorch.org/docs/2.15/generated/torch.allclose.html)在这里约为 `1.01e-6`，足以容纳这个差异。因此它适合回答“足够接近吗”，却不能替代“实际存储的奖励完全相等吗”。这段检查要求近似同奖组与原函数保持一致，不要求它在所有设备上产生同一组末位数值。

这个单组函数也无法识别“本该有八个成员，却只来了七个”。组大小、成员归属和重复采样检查仍应放在上游。`r.numel() >= 2` 只是示例的统计前提，不是分组完整性的证明。

后续实际训练验收中，检查到的同奖组，其 `advantages` 和 `returns` 都恢复为了精确的零。这里归零的是这一项组内相对优势；KL 等其他损失项或优化器状态仍可能影响参数更新，不能据此要求整个训练步都不更新。

对这类归一化代码，值得在测试里长期保留两个互补的要求：**没有组内差异时，不凭空制造相对优势；确实存在微小差异时，也不随手将它抹掉。**
