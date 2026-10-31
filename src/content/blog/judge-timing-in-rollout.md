---
title: "reward 计时接近零，Judge 的等待算到哪了？"
description: "沿实际调用顺序解释评分等待的归属，避免被一个接近零的阶段数字误导。"
category: technical
lang: zh-CN
topic: runtime
tags: [Agent RL, 性能分析, 可观测性]
pubDate: "2026-11-01T06:32:29+08:00"
order: 7
draft: false
review: true
---

看训练日志时，可能遇到一组看起来矛盾的现象：Judge 请求明显有等待，`reward` 阶段却几乎不花时间。直觉上，评分应该属于 reward，于是很容易怀疑计时漏了，或者误以为评分成本可以忽略。

先别改计时器。字段名描述的是代码中的一个入口，它包住的区间，未必覆盖这个业务步骤的全部成本。关键是找到：**评分在哪一层发起，又在哪一层等待完成。**

## 评分可能已经在 rollout 里完成

考虑一种常见实现：rollout worker 生成答案后，直接调用 Judge，并把评分连同轨迹一起返回。driver 等整个 batch 返回之后，才进入名为 `reward` 的代码块。

```text
driver: await rollout_batch(...)
  └─ worker
      ├─ 生成答案
      ├─ 调用 Judge 并等待评分
      └─ 返回轨迹和 score

driver: reward
  └─ 读取 batch 中已经返回的 score
```

在这条调用链中，Judge 的等待发生在 `rollout_batch` 返回之前。driver 后面的 reward 入口只需取出评分、组织张量，当然可能很快。它测到的是这一小段工作的耗时，不能代表整次评分已经花掉的时间。

这是一种具体的调用组织方式，并非所有训练框架都如此。如果另一个实现将 Judge 放到 driver 中同步调用，它的计时归属就会不同。判断应从实际调用和等待位置出发。

## 两个计时器测的是不同区间

把上面的结构缩成伪代码，会更容易看清楚：

```python
async def train_step(prompts):
    with timer("generate"):
        batch = await generate_and_score(prompts)
    with timer("reward"):
        rewards = [item.score for item in batch]
    return rewards
```

这里的 `timer` 和服务调用省略了实现，只表示包住哪一段代码。若计时器用 [`time.perf_counter()`](https://docs.python.org/3/library/time.html#time.perf_counter) 的前后差值，它统计的是这段区间经过的时间，包括等待；它不会追溯已经发生在前一个代码块里的工作。

因此，两个数字可以同时正确：`generate` 包含生成与评分等待，`reward` 只包含结果读取。需要修正的可能是统计表对字段的解释，而不是函数本身。

类似情况也出现在预取和缓存中。拿到一个已经准备好的对象很快，准备这个对象却可能很慢。只围住最终读取动作，回答的是读取延迟，无法回答准备成本。

## 给等待标记归属

实用的做法是保留 driver 的整体区间，同时在 worker 中给真实 Judge 请求增加独立 span，再用请求标识把两侧记录关联起来。然后按实际可观测的边界区分客户端重试、服务端排队和返回。只有客户端总耗时时，就保留这个总量，不把它猜测成某个内部阶段。

解读时还要保留包含关系。Judge span 已经位于 `generate` 内，不能再把它加一次作为完整训练步的额外时间。多个 worker 并发评分时，各请求耗时的总和也可能大于整批墙钟；[`asyncio.gather()`](https://docs.python.org/3/library/asyncio-task.html#running-tasks-concurrently) 这类并发等待，本来就允许多个请求区间重叠。

展示时可以把一个字段写清楚为“生成及评分后处理等待”，另一个写成“已返回评分的物化”，而不是让相似名称暗示相同范围。请求次数也应标明是客户端尝试数还是评分任务数，避免重试把计时与计数再次混在一起。

遇到异常小的阶段数字，先列出计时器的开始、结束和真正等待的位置。边界对应上了，数字才能回答你想问的问题。
