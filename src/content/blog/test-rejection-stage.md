---
title: "测试提前报错了，先看它在哪一层拒绝"
description: "负例在预期之外的位置被拒绝时，如何区分真实回归与过时的测试夹具。"
category: technical
lang: zh-CN
translationKey: test-rejection-stage
topic: training
tags: [测试, 输入校验, padding]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-03T19:29:09+08:00"
order: 8
draft: false
review: true
---

负例测试的目标通常是确认非法输入会被拒绝。但“确实拒绝了”和“测试通过了”并不总是一回事：测试还可能要求某个特定阶段抛出某段错误文字。

一次 padding 负例就遇到了这种情况。测试预期输入进入后面的检查点后报错，实际却在物化训练视图时触发了已有的一致性检查。保护已经生效，夹具仍把这个结果标成失败。最终需要修正的是预期的拒绝位置和信息。

## 先确认实际报错的理由

假设处理流程是：构造输入、物化视图、执行后置检查、进入计算。前面的步骤一旦拒绝输入，后面的检查就不会运行。

因此，看到“预期错误没有出现”时，要沿 traceback 找到实际失败位置。它可能是同一条约束更早生效，也可能是拼错字段、环境缺依赖或者完全无关的异常。只有前一种情况，才支持调整这条负例的预期。

更早报错本身并不是正确性的证明。还需要确认被拒绝的确实是负例想破坏的条件，以及正常输入仍然有通过路径。否则，把预期改成当前报错，只是在掩盖另一个问题。

这里也有一个契约前提：接口允许在计算前的合法边界拒绝这类输入。如果错误阶段、类型或格式本身就是对外承诺，改变它们仍可能是不兼容变更，不能仅凭“反正没进入计算”就放过。

## 把拒绝原因与阶段分开记录

下面是一个独立的缩小示例，不是历史生产代码。约定输入是三个元素的列表，最后一位是 padding，必须为零；物化步骤把它变成带 `mask` 字段的视图。异常用 `stage` 表达拒绝位置，用错误类别表达违反了什么条件。

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

调用 `process([1, 1, 1])` 时，`materialize` 会先拒绝最后一位，`postcheck` 根本不会运行。旧夹具若要求这个调用报 `stage == "postcheck"`，就会失败，但不能因此推断非法 padding 进入了计算。

`process(None)` 则是另一种失败：输入形状不符合示例接口，会触发 `TypeError`。它并未验证 padding 规则。如果原本想测 padding 的夹具误构造出 `None`，即使程序报了错，这条负例仍没有测到目标。

[`pytest.raises()`](https://docs.pytest.org/en/stable/how-to/assert.html#assertions-about-expected-exceptions) 可以保留异常对象供进一步检查。如果依赖错误消息，也可以用 `match`；它按正则匹配，并不是自动做完整字符串相等比较。稳定的错误类别和结构化原因通常更容易维护，具体阶段是否也要固定，则取决于测试的目标。

## 调整夹具时仍要保护原来的约束

这里有两种不同的测试任务。集成负例关心非法输入在计算前被合法地拒绝，应接受契约允许的拒绝边界。针对某个后置检查的单元测试，则要直接测试那个检查，或构造能够到达它的输入。

接着上面的函数，可以把正常对照、集成负例和后置检查的单元负例分别写出来：

```python
# 正常输入经过两层检查，得到预期视图。
assert process([1, 1, 0]) == {"mask": (1, 1, 0)}

# 集成负例在更早的物化阶段被拒绝。
with pytest.raises(InvalidPadding) as early:
    process([1, 1, 1])
assert early.value.stage == "materialize"

# 单独测试后置校验，不要求非法输入穿过前面的保护。
with pytest.raises(InvalidPadding) as late:
    postcheck({"mask": (1, 1, 1)})
assert late.value.stage == "postcheck"

# 形状错误是另一条契约，不能冒充 padding 负例。
with pytest.raises(TypeError, match=r"^expected a three-element list$"):
    process(None)
```

第三项直接给 `postcheck` 一个只含必要字段的视图，是在隔离测试它自己的规则。它不证明这个坏视图能从生产入口到达后置阶段，也不需要为此关闭前面的保护。第一项保留完整正常路径，第二项验证入口会拒绝坏输入，两者不能被第三项取代。

正常对照最好与负例只差被测的那个条件。这里二者都是三个元素的列表，只把末位从 `0` 改成 `1`。如果同时更换容器类型、长度和 padding 值，一次报错就不足以说明哪条规则生效。后置单测也应保持一致的最小视图结构。

调整预期时，仍应保留三个要求：异常必须对应这条非法条件；正常对照输入不能一起被拒绝；未知或无关错误不能被宽泛的 `except Exception` 吞掉。

在前面的真实问题里，修改范围落在夹具预期，生产计算路径没有因此改变，当时也没有重新执行 CPU 套件。确认差异范围或语法合法，只能说明改动是什么；不能据此宣布整条链已通过新的验收。把预期修正与执行验证分别记录，才能避免为消除红色测试而降低保护。

## 运行本文示例

[下载完整脚本](/examples/test-rejection-stage.py)。2026-11-03 在 **Python 3.11.11、macOS arm64 CPU** 上运行，15 项检查通过。下载版仅使用标准库；正文两段代码也按顺序组装，并使用 **pytest 8.3.5** 执行通过。

```sh
python test-rejection-stage.py
```

正常输入调用了一次 `postcheck`；非法 padding 在 `materialize` 被拒绝，`postcheck` 的调用次数为零。直接测试后置校验仍能得到 `stage="postcheck"`，而 `None` 的形状错误与缺失字段的 `KeyError` 没有被冒充为 padding 检查通过，见[实测记录](/examples/cpu-verification-more.json)。

这验证的是文章中的合成函数及对应检查，不是历史生产夹具或完整训练套件的重跑。前文“当时没有重新执行 CPU 套件”的历史事实保持不变。
