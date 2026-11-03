---
title: "裁短 KV cache，不等于回滚全部模型状态"
description: "在混合注意力模型中，缓存长度恢复了，不代表卷积与循环状态也回到了原来的前缀。"
category: technical
lang: zh-CN
translationKey: hybrid-cache-crop-state
topic: model
tags: [KV Cache, Transformers, 混合注意力]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 9
draft: false
review: true
---

给同一段前文的两个续写分别打分时，一个直觉上的办法是：先算续写 A，把 cache 裁回原来的前缀长度，再接着算续写 B。

这能否成立，取决于 cache 里究竟保存了什么。对于同时使用注意力层和循环状态层的模型，`crop` 不一定是完整的“撤销”。下面固定讨论 **Transformers v5.12.1 的混合缓存实现**，不将它推广到所有模型或版本。

## 长度只描述一部分状态

普通注意力缓存保存历史位置的 key 和 value。若实现支持裁剪，删除后面的位置，在形式上比较容易理解。

但混合模型的 cache 还可能保存卷积状态和 recurrent state。后者是处理过一段历史后得到的状态，不是一张按 token 位置排列、可以直接截去后半部分的表。能删除 KV 中的若干位置，不等于能从当前 recurrent state 中减去相同长度的历史。

这个版本的 `DynamicCache` 根据模型配置中的层类型构造不同缓存层；各层并不共享同一种裁剪语义。[官方构造逻辑](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1453-L1474)

## crop 不是历史快照

顶层 `Cache.crop` 会逐层调用各层的 `crop`。而这个版本的 `LinearAttentionCacheLayerMixin.crop` 没有修改状态，其实现只是返回，不进行裁剪。[顶层分派](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1347-L1350)、[循环状态层的实现](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L912-L914)

因此，在已经消费了续写 A 之后调用 `crop(prefix_length)`，不能据此认定整个模型回到了只读过前缀的状态。即使注意力缓存被裁短，其余层仍可能保留消费过续写后的状态。

只检查 `get_seq_length()` 也不足够。在该版本的混合缓存中，默认长度查询会找到一个注意力层读取长度；它不描述所有循环状态的历史。[官方长度查询逻辑](https://github.com/huggingface/transformers/blob/ddb849abe009d1089e6c691bfc897f27211c663c/src/transformers/cache_utils.py#L1249-L1270)

类似地，`reset` 通常是清空状态，也不能代替恢复某个已经计算好的前缀。清空、裁剪和恢复历史快照，应当视为三种不同操作。

## 用一个小状态看裁剪前后

可以用一个独立的 toy 看清这个区别：列表记录已处理的输入，另一个整数按 `state = 10 * state + value` 更新。这个递推式不是任何模型的计算公式，也不是缓存污染的实测；它只让“按位置保存的数据”和“已经累积的状态”变得容易手算。

```python
class ToyCache:
    def __init__(self):
        self.slots = []
        self.state = 0

    def append(self, value):
        self.slots.append(value)
        self.state = 10 * self.state + value

    def crop(self, length):
        self.slots = self.slots[:length]  # 不恢复递推状态

reused = ToyCache()
for value in [1, 2]:
    reused.append(value)
assert reused.state == 12

reused.append(3)  # 续写 A
reused.crop(2)
assert len(reused.slots) == 2
assert reused.state == 123  # 长度回到 2，状态没有回到 12
reused.append(4)  # 接着处理续写 B

fresh = ToyCache()
for value in [1, 2, 4]:
    fresh.append(value)

assert reused.slots == fresh.slots == [1, 2, 4]
assert (reused.state, fresh.state) == (1234, 124)
```

按定义逐步展开，得到下面的预期关系：

| 路径阶段 | 列表中的输入 | 递推状态 |
|---|---|---:|
| 只处理前缀 | `[1,2]` | 12 |
| 追加 A | `[1,2,3]` | 123 |
| 裁回前缀长度 | `[1,2]` | 123 |
| 裁剪后追加 B | `[1,2,4]` | 1234 |
| 从新状态处理前缀与 B | `[1,2,4]` | 124 |

最后两行连列表内容都相同，递推状态却不同。如果只检查长度，甚至只检查可裁剪那部分的内容，就会漏掉这一区别。表中的数值来自 toy 的整数递推，不是模型分数；它说明的是检查完整状态的必要性。

在这个 toy 中，前缀状态 `12` 很容易写出来，但 `crop` 没有恢复它。真实模型需要的是对应前缀的有效状态，而不是按这个虚构公式反算。若选择 `reset`，也要重新消费前缀，不能清空之后直接接上 B。

## 独立评分先隔离状态

一种直接的做法，是让每个独立评分任务拥有自己的 cache。任务内部可以在连续输入块之间复用它；切换到另一条独立续写时，重新从前缀建立状态。

下面是两个合成续写的处理示意：

```text
新 cache A → 消费前缀 → 消费续写 A → 读取分数 → 丢弃 A
新 cache B → 消费前缀 → 消费续写 B → 读取分数 → 丢弃 B
```

这会重新计算前缀，所以不能把它描述成免费的优化。它的价值是让状态边界清楚：第二条续写不会依赖“裁剪是否恢复了每一层状态”这个未经确认的假设。

如果确实要共享前缀计算，应使用模型与缓存实现明确支持的分支、复制或恢复方式，并确认卷积、循环状态和 KV 都被包含。仅复制 Python 容器，或者仅看到 KV 长度相同，不足以证明两个任务已隔离；可变张量是否共享存储也需要检查。

例如，两个变量都指向同一个 cache 时，给 A 追加内容也会改变 B 随后看到的状态。是否能够安全复制，应由具体缓存类型的接口保证，不能把通用 `deepcopy` 当作所有实现都支持的回滚方案。验证时，应把复用路径与重新消费相同前缀的路径对照，检查所需状态和输出，而不只看一个长度字段。

复用 cache 前，先确认一个问题：**模型被保证处于哪一段历史之后？** 把状态归属和恢复语义讲清楚，再决定如何节省前缀计算。

## 运行本文示例

[下载完整脚本](/examples/hybrid-cache-crop-state.py)。它只依赖 Python 标准库。2026-11-03 使用 **Python 3.11.11、macOS arm64 CPU** 运行，20 项检查通过：

```sh
python hybrid-cache-crop-state.py
```

两条路径最终的列表都为 `[1,2,4]`，裁剪后继续复用的状态是 `1234`，独立重建的状态是 `124`。脚本还检查了同一对象的别名会共享修改，以及 `crop(0)` 清空列表却不清空递推状态，见[实测记录](/examples/cpu-verification-more.json)。

这是对文中 **ToyCache 的整数／列表逻辑**的实际执行，不是对真实 KV cache、卷积状态、张量存储或 Transformers 的实测。固定版本真实缓存的行为仍由前面的源码引用支持。
