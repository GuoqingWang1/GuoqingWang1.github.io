---
title: "算 logprob 时，目标 token 应该对哪一行？"
description: "从 next-token shift 到分块边界，避免把目标 token 配到错误的预测位置。"
category: technical
lang: zh-CN
translationKey: causal-logprob-row-alignment
topic: model
tags: [语言模型, LogProb, 张量对齐]
pubDate: "2026-11-01T06:32:29+08:00"
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

若自己从完整 logits 取分，可以写出下面的简化形式。它假设输入没有 padding，logits 尚未裁剪位置；返回结果的第 `i` 项对应输入的第 `i+1` 个 token。

```python
def next_token_logprobs(logits, token_ids):
    # logits: [B, L, V]；token_ids: [B, L]
    logp = logits[:, :-1, :].log_softmax(dim=-1)
    targets = token_ids[:, 1:]
    return logp.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
```

但如果使用的是已经在内部移动标签的 loss 接口，就不要再提前移动一次标签。否则，本来正确的一位偏移会变成两位。接口返回的是完整 logits、已选预测行，还是已经对齐好的 token logprob，也必须先分清。

实际 batch 还需要同步处理计分 mask。目标 token 的 mask 必须跟着目标位置移动，不能只移动 logits 和 token ID。用于控制注意力的 mask，也不自动等于“哪些 token 应计入答案分数”的 mask。

## 分块时，第一项可能属于前一块

设当前输入块覆盖全局位置 `[s, e)`。它返回的第 `0` 行是全局预测行 `s`，用于预测 `x[s+1]`。若目标位于全局位置 `j`，对应的局部预测行是 `j-1-s`。

最容易出问题的地方是 `j=s`：目标恰好位于当前块开头，局部预测行就变成了 `-1`。这不是让 Python 取当前块最后一行的许可，而是在提醒我们：需要的预测行在**前一块末尾**。

启用了 KV cache，也不意味着本次输出会自动带回前一块的 logits。可以在评分调度中把这个目标交给前一块最后一行处理，或保存那一行必要的预测结果；具体选择取决于已有输出接口。不能因为当前块已经拿到了目标 token，就直接用当前块第一行替代。

检查这种代码时，我会明确列出三个量：目标 token 的全局位置、预测行的全局位置、预测行的块内位置。先让这三者逐项对应，再比较不同分块方式的分数。位置一致是必要条件；数值是否一致，还要另外保持权重、位置编码、mask 和计算精度等条件可比。
