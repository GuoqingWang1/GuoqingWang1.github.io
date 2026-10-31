---
title: "checkpoint 加载成功，为什么新旧样本一拼 batch 就失败？"
description: "用新旧样本的字段对照和一次最小混批检查，说明为什么加载成功还不等于恢复正确。"
category: technical
topic: training
lang: zh-CN
translationKey: resume-first-mixed-batch
tags: [checkpoint, schema, 训练恢复]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 4
draft: false
review: true
---

我们遇到过一次这样的恢复故障：模型和优化器等状态已经加载，缓存队列也恢复了，训练却在下一批数据进入计算前停了下来。报错来自严格的拼批检查：旧缓存与新生成样本的字段集合不一致。

进一步检查发现，那个字段本来就在保存的缓存里，是恢复分支把它删掉了。单独看加载过程没有异常，直到两条数据路径汇合，问题才显现出来。

## 旧缓存和新样本走过不同的路

[PyTorch 的通用 checkpoint 示例](https://docs.pytorch.org/tutorials/beginner/saving_loading_models.html)会一起保存模型、优化器和训练进度。对于带预取、异步生成或部分复用的训练，应用还可能维护已经生成但尚未消费的样本。这些状态同样需要经过保存、恢复和再次消费。

下面用虚构的 `trace` 字段表示一份下游仍需要的元数据。两条记录和标识都只是示例：

```python
cached = {"sample_id": "old-1", "reward": 0.0, "trace": {"schema": 1}}
fresh = {"sample_id": "new-1", "reward": 0.0, "trace": {"schema": 1}}
restored = {key: value for key, value in cached.items() if key != "trace"}

print(sorted(restored))  # ['reward', 'sample_id']
print(sorted(fresh))     # ['reward', 'sample_id', 'trace']
print(set(restored) == set(fresh))  # False
```

这不是说字段集合相同就足够了；dtype、形状、成员对应关系和字段语义也可能需要检查。但连字段集合都不一致，已经说明恢复后的对象没有满足新样本正在遵循的接口。

当时的具体原因是两套功能路径共用了一个字段。旧功能按设计关闭，另一条有效路径仍在生产和消费这份元数据。恢复器却根据旧开关，推断这列已经无用，于是清理了缓存中的字段。新生成的数据没有经过这段清理，自然仍带着它。

为什么只跑新数据或只检查恢复对象，容易漏掉它？可以只看“成员之间的字段集合是否相同”这一层检查：

| 进入拼批的成员 | 字段集合比较能看到什么 |
|---|---|
| 全是新样本 | 都带 `trace`，彼此一致 |
| 全是被错误清理的旧样本 | 都缺 `trace`，仍然彼此一致 |
| 旧样本与新样本混合 | 一边有、一边没有，差异立即出现 |

第二行尤其值得注意：**彼此一致，不等于符合下游要求。** 如果检查只拿第一个成员作模板，整批同时丢失的字段就可能逃过去。因此，既要检查成员之间是否兼容，也要检查它们是否符合当前接口。

## 修复恢复规则，保留严格拼批检查

让拼批立即通过很容易：删掉新样本的字段、对旧样本补空值，或者只取所有成员字段的交集。问题是，下游可能需要的恰好就是被删掉或补成空的内容。

应先回答一个更具体的问题：**当前生效的生产者和消费者，是否要求这个字段存在？** 一个历史配置项为 `false`，不足以单独回答它。

对于明确需要 `trace` 的活跃路径，可以让恢复和拼批共用同一条小校验。下面的代码只检查这个合成记录的字段集合与 `trace` 版本：

```python
EXPECTED_FIELDS = {"sample_id", "reward", "trace"}

def validate_record(row):
    if set(row) != EXPECTED_FIELDS:
        raise ValueError("record fields do not match the active schema")
    trace = row["trace"]
    if not isinstance(trace, dict):
        raise ValueError("missing required trace")
    if type(trace.get("schema")) is not int or trace["schema"] != 1:
        raise ValueError("trace schema mismatch")
    return row

def restore_active_record(saved):
    return validate_record(saved)  # 保留原记录，不删除必需字段

def join_records(cached_rows, fresh_rows):
    rows = cached_rows + fresh_rows
    for row in rows:
        validate_record(row)
    return rows
```

这里没有重算奖励，也没有改写原记录。它还没有检查 dtype、张量形状、标识唯一性或内部所有权关系，不能直接替换训练框架的完整合批函数。相关功能确实关闭时，则按已经定义的迁移规则处理旧字段，不能把这段活跃路径的规则直接套过去。

实际修复中，我们保留了严格的拼批校验，让恢复入口按当前有效路径识别元数据要求。缺失必需信息或版本不匹配仍然报错，不把未知状态补成一个看似合法的零。

## 把第一次混批纳入恢复验收

只验证 `load_state_dict` 没有抛异常，覆盖不到这个故障。接着前面的合成记录，可以把一次正例与一次负例写在同一个小检查中：

```python
from copy import deepcopy

before = deepcopy(cached)  # 为这个纯字典示例保留独立快照
batch = join_records([restore_active_record(cached)], [fresh])
assert [row["sample_id"] for row in batch] == ["old-1", "new-1"]
assert [row["reward"] for row in batch] == [0.0, 0.0]
assert batch[0] == before
assert cached == before  # 恢复过程没有改写保存的记录

try:
    join_records([restored], [fresh])
except ValueError as error:
    assert str(error) == "record fields do not match the active schema"
else:
    raise AssertionError("the damaged restored record was accepted")
```

正例检查的不只是能否拼起来，还包括旧成员是否保留、新旧顺序是否符合示例约定、奖励和必需元数据有没有被改掉。这里比较的是事先保存的独立快照，避免两个引用指向同一对象、被一起改写后仍然“相等”。负例则保证错误清理后的记录仍会被拒绝。实际回归应经过框架真正使用的恢复与拼批入口，并按其约定检查顺序，不能只测这段缩小后的函数。

还要保留几类边界用例：必需字段缺失、字段版本不匹配、未知额外字段，以及功能真正关闭时的恢复行为。前几类应按接口拒绝不兼容数据；功能关闭后的合法恢复或迁移则应正常通过。它们验证的是不同条件，不能都用“这次没有报错”代替。

当时这条修复先通过了有界的新旧混批检查，随后在原训练路径里完成了真实混批和新的更新。它说明这个恢复接口问题已经跨过实际消费边界，不代表训练效果也因此得到保证。

**恢复后的第一批混合数据，是一个值得单独测试的边界。** 很多问题既不在保存端单独出现，也不在新数据端单独出现，而是在两者相遇时才暴露。
