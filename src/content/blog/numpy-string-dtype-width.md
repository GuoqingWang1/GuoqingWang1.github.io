---
title: "字符串长度也在 dtype 里：一次合批前的 schema 误判"
description: "定宽字符串的容量不同，怎样与真正的类型不兼容区分开。"
category: technical
lang: zh-CN
translationKey: numpy-string-dtype-width
topic: training
tags: [NumPy, 数据类型, 合批]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 5
draft: false
review: true
---

一次训练链路的冒烟检查，在合批时被一个非张量字段拦住了。两份数据里的这个字段都是字符串，字段名和结构也没有变化，严格检查却报告 dtype 不一致。

报错来自我们自己的 schema 检查：它要求两边的 NumPy dtype 完全相等。对于定宽字符串，dtype 还包含容量。单条结果分别构造数组时，字符串长短不同，就可能得到不同的 dtype。

## 同类字符串，容量也可能不同

先用两条合成记录把差别写清楚：

```python
import numpy as np

a = np.array(["ok"])
b = np.array(["retry"])

assert a.dtype == np.dtype("U2")
assert b.dtype == np.dtype("U5")
assert a.dtype != b.dtype

merged = np.concatenate([a, b])
assert merged.dtype == np.dtype("U5")
assert merged.tolist() == ["ok", "retry"]
```

在常见的小端环境中，前两个 dtype 显示为 `<U2` 和 `<U5`。`U` 表示定宽 Unicode 字符串，数字是最多容纳的 Unicode 码点数，前面的符号描述字节序。它们的种类相同，容量不同。[NumPy 的字符串说明](https://numpy.org/doc/stable/user/basics.strings.html#fixed-width-data-types)解释了这种表示。

按这些类型规则，例子的预期内容如下。表中省略了字节序前缀，并不是一次新的运行日志。

| 对象 | 内容 | dtype | 每个元素的容量 |
|---|---|---|---:|
| `a` | `["ok"]` | `U2` | 2 个码点 |
| `b` | `["retry"]` | `U5` | 5 个码点 |
| `merged` | `["ok", "retry"]` | `U5` | 5 个码点 |

因此，精确的 dtype 判等会拒绝这一对输入，而 [`np.concatenate`](https://numpy.org/doc/stable/reference/generated/numpy.concatenate.html) 本身可以选择足够宽的结果类型。我们遇到的是合批前的检查过严，不能把它归结成“NumPy 无法拼接不同长度的字符串”。

## 统一成较窄的 dtype 会丢掉内容

发现容量不一致后，还不能随便挑一个 dtype，把所有输入转过去。例如统一成第一条记录的 `U2`，第二条记录就放不下了：

```python
narrow = b.astype("U2")
assert narrow.dtype == np.dtype("U2")
assert narrow.tolist() == ["re"]
assert b.tolist() == ["retry"]
assert not np.can_cast(b.dtype, narrow.dtype, casting="safe")
```

`retry` 有五个码点，`U2` 只能留下前两个。dtype 现在“对齐”了，结果内容却已经不对。[`astype` 的默认转换规则](https://numpy.org/doc/stable/reference/generated/numpy.ndarray.astype.html)是 `unsafe`；不能把没有抛异常当成内容完整的证明。

最后一条断言检查的是 dtype 到 dtype 的安全转换关系。`U5` 能表示的内容不一定装得进 `U2`，所以不能按 `safe` 规则缩窄。它不依赖眼前某条字符串是否碰巧很短。

## 只允许同类字符串安全扩宽

我们的修补只放宽这一类情况：同为 `U`，或同为 `S`，允许扩大容量。`S` 的容量按字节计；Unicode 和字节串混在一起时，仍按接口约定处理，不顺手改变它们的含义。

放宽之前，还要确认容量不是业务规定的最大长度。如果字段本来就只允许两个码点，`retry` 应在入口被拒绝；扩成 `U5` 反而改变了契约。这里讨论的是内容合法，仅因各批次自动推断了不同宽度而受阻的情况。

下面只处理同一字段的一个非空列表，其中每项都是一维字符串数组。先选择公共 dtype，再对齐，最后才进入需要统一 dtype 的检查和拼接：

```python
def widen_text_column(parts):
    if not parts or any(x.ndim != 1 for x in parts):
        raise ValueError("expected a nonempty list of 1-D arrays")
    kinds = {x.dtype.kind for x in parts}
    if len(kinds) != 1 or not kinds <= {"U", "S"}:
        raise TypeError("expected one fixed-width string kind")
    common = np.result_type(*(x.dtype for x in parts))
    return [x.astype(common, casting="safe", copy=False) for x in parts]

normalized = widen_text_column([a, b])
assert all(x.dtype == np.dtype("U5") for x in normalized)
joined = np.concatenate(normalized)
assert joined.tolist() == ["ok", "retry"]
assert a.dtype == np.dtype("U2") and a.tolist() == ["ok"]
assert b.dtype == np.dtype("U5") and b.tolist() == ["retry"]
```

[`np.result_type`](https://numpy.org/doc/stable/reference/generated/numpy.result_type.html)按照类型提升规则选公共类型；这里两边都是定宽字符串，因此得到能容纳两边的较宽容量。[`safe` 转换](https://numpy.org/doc/stable/reference/generated/numpy.can_cast.html)再限制转换必须能够保留原值。`copy=False` 不是原地修改 dtype；需要更宽存储时，仍会产生结果数组。

原 schema 必须先允许这种受限的宽度协调。如果它在进入这一步前就坚持 `U2 == U5`，后面的代码根本不会执行。反过来，若接口本来就接受 NumPy 的类型提升，则无需额外对齐。

## 验证内容，也保留其他检查

报错信息也值得分层：记录字段名、shape、字符串 kind 和完整 dtype。只写“都是字符串”会遗漏容量，单写“dtype 不等”又解释不了是否能安全协调。把拒绝依据写清楚，后续才知道该检查内容，还是修正类型规则。

这个辅助函数不代替整个合批接口。字段集合、各列的成员对应关系、数值字段的 dtype，以及缺失值约定，都仍由原接口验证。这里限定一维列；处理更高维数据时，除拼接轴外的形状也必须一致。

回归用例应包含同宽字符串、不同宽度的同类字符串，以及足够长的值，并检查合并后的完整内容和顺序。`U`／`S` 混合、数值 dtype 不一致、缺失字段和非法形状，则要继续遵守各自的拒绝规则。

把所有字段都改成 `object`，会让字符串、数值和误混入的对象具有同一种 dtype，单靠 dtype 判等便难以区分。对象数组可以是明确的数据设计，但不适合作为躲开 schema 检查的统一补丁。

本文的范围是定宽 `U`／`S`。NumPy 2.0 起提供的变长 `StringDType` 使用另一种表示，需要单独考虑。把“类型不兼容”和“同类字符串容量不同”分开，才能同时保住合法数据和有效检查。
