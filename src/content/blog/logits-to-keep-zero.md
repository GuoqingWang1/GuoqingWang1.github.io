---
title: "logits_to_keep=0 为什么不是“不算 logits”？"
description: "用同一组张量比较整数零、最后 k 行、空索引和指定行，再看它们怎样影响输出层与分块评分。"
category: technical
lang: zh-CN
translationKey: logits-to-keep-zero
topic: model
tags: [PyTorch, Transformers, Logits]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 1
draft: false
review: true
---

给长文本打分时，常常只需要少数位置的 logits。输入分成多个块之后，有些块甚至没有需要打分的位置。把 `logits_to_keep` 设成 `0`，看上去很像“这一块不用输出”。

但在 **Transformers v5.12.1 的 `Qwen3_5ForCausalLM`** 中，整数 `0` 会保留全部位置。要表达零个位置，需要使用空的索引张量。这个差别不只是返回值的形状，还决定了输出层接下来处理多少行。

## 同一个张量，四种选择

该版本先计算 `hidden_states`，再选行，最后调用 `lm_head`。如果参数是整数，选择器是 `slice(-logits_to_keep, None)`；如果是索引张量，就直接使用它。[固定版本源码](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/models/qwen3_5/modeling_qwen3_5.py#L1675-L1678)

因此，正整数 `k` 表示最后 `k` 行；若 `k` 超过当前长度，普通切片最多取到现有的行。整数 `0` 则变成 `slice(0, None)`，也就是全部行。空张量走的是另一条索引分支，不能与整数零互换。

下面的独立示例只构造小张量，不加载语言模型。设 `B=2、L=6、H=4`，分别表示批大小、序列长度和隐藏维数；再用一个 `[V,H]=[10,4]` 的权重模拟输出层投影。所有值都是合成的，只用于说明形状。

```python
import torch
import torch.nn.functional as F

B, L, H, V = 2, 6, 4, 10
hidden = torch.arange(B * L * H, dtype=torch.float32).reshape(B, L, H)
weight = torch.zeros(V, H)

choices = {
    "integer 0": 0,
    "last 2": 2,
    "empty tensor": torch.empty(0, dtype=torch.long),
    "rows [1, 4]": torch.tensor([1, 4], dtype=torch.long),
}

for name, keep in choices.items():
    index = slice(-keep, None) if isinstance(keep, int) else keep
    selected = hidden[:, index, :]
    logits = F.linear(selected, weight)
    print(name, tuple(selected.shape), tuple(logits.shape))
```

按这段索引逻辑，预期形状如下；位置从零开始计数：

| 参数 | 保留的位置 | 选行后的隐藏状态 | logits |
|---|---|---|---|
| 整数 `0` | `0,1,2,3,4,5` | `[2,6,4]` | `[2,6,10]` |
| 整数 `2` | `4,5` | `[2,2,4]` | `[2,2,10]` |
| 空 LongTensor | 无 | `[2,0,4]` | `[2,0,10]` |
| LongTensor `[1,4]` | `1,4` | `[2,2,4]` | `[2,2,10]` |

整数 `2` 和索引 `[1,4]` 恰好都保留两行，但位置不同。因此，检查输出 shape 之外，还要检查具体行索引。这里的一维索引对两个 batch 成员使用同一组位置；它没有表达逐样本不同的选择。

padding 也要在这一层考虑。源码中的切片没有根据 `attention_mask` 自动寻找“最后几个有效 token”，它选的是张量位置。若样本采用右侧 padding，最后两行可能落在补齐区域；若 batch 内真实长度不同，共用一组行索引也未必符合评分目标。应先确定各样本实际需要的预测位置，再选择对应的打分接口。

## 减少的是输出层处理的位置

若选择了 `M` 行，进入输出层的张量就是 `[B,M,H]`。权重形状为 `[V,H]`，线性变换把最后一维从 `H` 映射到 `V`，得到 `[B,M,V]`。[PyTorch 的 `linear` 形状约定](https://docs.pytorch.org/docs/2.15/generated/torch.nn.functional.linear.html)正是这个关系。

这里减少的是序列位置，没有缩小词表。保留的每一行仍然对应 `V` 个 logits。空索引使 `M=0`，而整数 `0` 在本接口中使 `M=L`。

选行发生的时机也很重要。先算完整 logits，再在返回结果上切片，已经完成的词表投影不会被撤销。这个实现把选择放在 `lm_head` 之前，才有机会省去不需要的输出行计算。

不过，仅凭少了几行输出，还不能换算整个模型的峰值显存或运行时间。主干、缓存、临时工作区和输出层的开销不同，应该在各自实际边界上测量。

## 无目标的块，也要推进 cache

假设用 `use_cache=True` 将输入依次分成两块，所有需要读取的预测行都落在第二块。第一块可以传空行索引，但仍然要经过主干，让模型消费前缀，并把更新后的缓存交给第二块。

如果直接跳过第一块的前向，第二块看到的历史就变了。空输出只表示这一块没有要读取的预测分布，并不表示它对后续条件上下文没有作用。

分块调用时，我会同时检查两件事：无目标块的 logits 行数确实为零；该块仍然完整消费了自己的输入，后续调用拿到的是它更新后的 cache。只检查前一项，可能把“少算输出”误写成“少读前文”。

## 块内位置与 labels 要各自对齐

传入的行索引对应**本次前向返回的隐藏状态**。若当前块从全局位置 `s` 开始，全局预测行 `p` 对应局部行 `p-s`。只有它落在当前块范围内，才能用于这次选择。

还要区分[目标 token 与预测行](/zh/blog/causal-logprob-row-alignment/)：自回归打分中，全局第 `j` 个 token 由第 `j-1` 行预测。若目标恰好位于块首，所需预测行在前一块末尾，不能把算出的 `-1` 当作当前块的最后一行。

本文讨论的是 **`labels=None`、只读取 logits** 的调用。若同时传入 `labels` 让模型计算 loss，裁剪后的预测行与标签还需要按具体接口重新对齐，不能把空输出或部分输出直接配给完整标签。该版本在选行后才进入 loss 分支，这个顺序应当一并核对。[对应源码](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/models/qwen3_5/modeling_qwen3_5.py#L1675-L1682)

最后检查外层封装有没有把空列表转换成默认的整数 `0`。这个转换很小，也可能完全不报错，却会把“零个位置”重新变成“全部位置”。保留明确的参数类型和索引数量，往往比在结果出来后猜测工作量更直接。

## 运行本文示例

[下载完整脚本](/examples/logits-to-keep-zero.py)。2026-11-03 在 macOS arm64 CPU 上，用 **Python 3.11.11、PyTorch 2.6.0、单线程** 运行，22 项检查通过。在 Python 3.11 虚拟环境中保存脚本后运行：

```sh
python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
python logits-to-keep-zero.py
```

四种参数得到的 logits 形状依次为 `[2,6,10]`、`[2,2,10]`、`[2,0,10]`、`[2,2,10]`。脚本还比较了实际行内容，用非零权重与 Python 标量点积对照投影结果，并检查越界索引、空序列和原输入保护，见[实测记录](/examples/cpu-verification-more.json)。

这里执行的是同一选行表达式和小张量投影，**没有加载 Transformers 或模型**。主干、cache、labels/loss、峰值显存和端到端速度都不在这次验证范围内。
