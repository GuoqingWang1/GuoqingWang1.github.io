---
title: "算 logprob 时，目标 token 应该对哪一行？"
description: "从 next-token shift 到分块边界，避免把目标 token 配到错误的预测位置。"
category: technical
lang: zh-CN
translationKey: causal-logprob-row-alignment
topic: model
tags: [语言模型, LogProb, 张量对齐]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 2
draft: false
review: true
---

自己写语言模型打分代码时，最容易漏掉的检查之一，是目标 token 与 logits 行的对应关系。两者的形状可能完全匹配，算出来的数也都是有限值，却并不是我们想要的条件概率。

这里讨论普通自回归语言模型的 next-token 打分：已知前文，计算后续 token 的概率。例子都是合成的位置示意，不涉及真实样本。

## 第 j 个 token，用第 j−1 行预测

对于完整输入 `x[0], x[1], ...`，第 `j` 行隐藏状态已经消费了 `x[j]`。该行 logits 用于预测它后面的 token。因此，目标 `x[j]` 应当对应预测行 `j-1`，而不是同下标的第 `j` 行。

用一个带起始 token 的短序列表示：

```text
输入位置       0      1      2      3      4
输入 token    BOS     P0     P1     A0     A1
该行预测目标   P0     P1     A0     A1     后续 token
```

如果只给答案 `A0、A1` 打分，就应取第 `2、3` 行 logits。取第 `3、4` 行后再 gather `A0、A1`，虽然也能得到两个数，但条件上下文已经不同：模型在产生对应隐藏状态时已经看过目标 token。

若前文含 `C` 个 token（至少一个，如 BOS）、答案含 `M` 个 token，答案对应的预测行区间就是 `[C-1, C+M-1)`，共 `M` 行。特别要检查答案的首个 token，是否由前文最后一行预测。这里使用的是实际 token 数量，不能用解码后的字符串长度替代。

Transformers v5.12.1 的 `ForCausalLMLoss` 也体现了这个对应关系：它将标签向前对齐一位，并忽略最后一个没有后续目标的位置。[官方实现](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/loss/loss_utils.py#L48-L71)

## Shift 只能做一次

若自己从完整 logits 取分，要把“选哪一行”和“这一行取哪个词表项”分开：前者由目标位置减一决定，后者由目标 token ID 决定。`gather(dim=-1)` 只执行后者，不会替我们修正时间位置。[`torch.gather` 的接口](https://docs.pytorch.org/docs/2.15/generated/torch.gather.html)要求显式提供索引，也没有 `ignore_index` 参数。

下面给前面的序列增加一个右侧 padding 位置。合成词表有五项，答案 `A0、A1` 的编号分别设为 `3、4`；`labels` 与原输入位置对齐，前文和 padding 用 `-100` 表示不计分。这里的 `labels` 不是送入模型的 `input_ids`，代码也不负责构造模型前向使用的 `attention_mask`。

```python
import torch

def masked_next_token_logprobs(logits, labels):
    # 完整、未裁剪的 logits；labels 尚未做 shift。
    assert logits.ndim == 3 and labels.shape == logits.shape[:2]
    assert labels.dtype == torch.long and labels.device == logits.device

    targets = labels[:, 1:]
    keep = targets.ne(-100)
    invalid = keep & ((targets < 0) | (targets >= logits.shape[-1]))
    if invalid.any():
        raise ValueError("target ID outside vocabulary")

    # -100 不是合法词表索引；只为忽略位放入安全占位索引。
    safe_targets = targets.masked_fill(~keep, 0)
    logp = logits[:, :-1, :].log_softmax(dim=-1)
    scores = logp.gather(-1, safe_targets.unsqueeze(-1)).squeeze(-1)
    return scores, keep

logits = torch.zeros((1, 6, 5), dtype=torch.float32, device="cpu")
labels = torch.tensor([[-100, -100, -100, 3, 4, -100]], dtype=torch.long, device="cpu")
scores, keep = masked_next_token_logprobs(logits, labels)

assert keep.tolist() == [[False, False, True, True, False]]
assert labels[:, 1:][keep].tolist() == [3, 4]
assert scores[keep].numel() == 2
```

移位之后，`scores` 的第 `i` 项对应输入的第 `i+1` 个 token；因此本例只有预测行 `2、3` 被保留。占位索引 `0` 只是让 `gather` 合法，忽略位的分数没有计分意义，聚合前仍必须使用 `keep`。不能先拿 `-100` 去索引，再指望事后乘 mask 补救。[`masked_fill`](https://docs.pytorch.org/docs/2.15/generated/torch.Tensor.masked_fill.html)在这里返回新张量，没有改写原始标签。

这个例子检查的是位置和掩码关系。全零 logits 只是占位输入，代码中的断言表示预期关系，不是模型打分实测；如果没有任何计分位置，还应在调用方明确处理空集合，避免对它直接求均值。

但如果使用的是已经在内部移动标签的 loss 接口，就不要再提前移动一次标签。否则，本来正确的一位偏移会变成两位。接口返回的是完整 logits、已选预测行，还是已经对齐好的 token logprob，也必须先分清。

实际 batch 还需要同步处理计分 mask。目标 token 的 mask 必须跟着目标位置移动，不能只移动 logits 和 token ID。用于控制注意力的 mask，也不自动等于“哪些 token 应计入答案分数”的 mask。

## 分块时，第一项可能属于前一块

设当前输入块覆盖全局位置 `[s, e)`，并且尚未裁剪输出行。它返回的第 `0` 行是全局预测行 `s`，用于预测 `x[s+1]`。若目标位于全局位置 `j`，对应的局部预测行是 `j-1-s`。若已经提前选行，则应使用保存的行映射，不能再直接套这个偏移。

最容易出问题的地方是 `j=s`：目标恰好位于当前块开头，局部预测行就变成了 `-1`。这不是让 Python 取当前块最后一行的许可，而是在提醒我们：需要的预测行在**前一块末尾**。

把上面的六个位置分为 `[0,3)` 和 `[3,6)` 两块，答案的对应关系可以直接手算：

| 目标 | 目标全局位置 `j` | 预测行 `j-1` | 产生该行的块 | 该块内的行号 |
|---|---:|---:|---|---:|
| `A0` | 3 | 2 | `[0,3)` | 2 |
| `A1` | 4 | 3 | `[3,6)` | 0 |

第二块虽然包含两个答案 token，但只在自身第 `0` 行提供 `A1` 的预测。`A0` 的预测必须取自第一块最后一行。索引前先检查 `s <= j-1 < e`，可以让不属于当前块的目标明确失败，避免负索引悄悄绕到末尾。

启用了 KV cache，也不意味着本次输出会自动带回前一块的 logits。可以在评分调度中把这个目标交给前一块最后一行处理，或保存那一行必要的预测结果；具体选择取决于已有输出接口。不能因为当前块已经拿到了目标 token，就直接用当前块第一行替代。

检查这种代码时，我会明确列出三个量：目标 token 的全局位置、预测行的全局位置、预测行的块内位置。先让这三者逐项对应，再比较不同分块方式的分数。位置一致是必要条件；数值是否一致，还要另外保持权重、位置编码、mask 和计算精度等条件可比。
