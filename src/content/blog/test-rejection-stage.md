---
title: "测试提前报错了，先看它在哪一层拒绝"
description: "负例在预期之外的位置被拒绝时，如何区分真实回归与过时的测试夹具。"
category: technical
lang: zh-CN
translationKey: test-rejection-stage
topic: training
tags: [测试, 输入校验, padding]
pubDate: "2026-11-01T06:32:29+08:00"
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

## 把拒绝原因与阶段分开记录

下面是一个独立的缩小示例：约定 mask 最后一位是 padding，必须为零。异常用 `stage` 属性表达拒绝位置，错误类别表达违反了什么条件。

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

如果旧夹具把最后一行写成 `stage == "postcheck"`，它就会失败，但不能因此推断非法 padding 进入了计算。这个输入在 `materialize` 中已经被拒绝，要求它再触发后置错误并不符合执行路径。

[`pytest.raises()`](https://docs.pytest.org/en/stable/how-to/assert.html#assertions-about-expected-exceptions) 可以保留异常对象供进一步检查。如果依赖错误消息，也可以用 `match`；它按正则匹配，并不是自动做完整字符串相等比较。稳定的错误类别和结构化原因通常更容易维护，具体阶段是否也要固定，则取决于测试的目标。

## 调整夹具时仍要保护原来的约束

这里有两种不同的测试任务。集成负例关心非法输入在计算前被合法地拒绝，应接受契约允许的拒绝边界。针对某个后置检查的单元测试，则要直接测试那个检查，或构造能够到达它的输入。不能为了走到后面，先把前面正确的保护关掉。

调整预期时，仍应保留三个要求：异常必须对应这条非法条件；正常对照输入不能一起被拒绝；未知或无关错误不能被宽泛的 `except Exception` 吞掉。

在前面的真实问题里，修改范围落在夹具预期，生产计算路径没有因此改变。确认差异范围或语法合法，只能说明改动是什么；一次新的执行验证是否通过，仍需要独立的结果。把“断言改对了”与“整条链已验收”分开，才能避免为消除红色测试而降低保护。
