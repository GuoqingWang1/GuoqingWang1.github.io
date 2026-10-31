---
title: "When reward time is near zero, where is the wait for Judge counted?"
description: "Trace where scoring waits actually occur to interpret a near-zero reward timer correctly."
category: technical
lang: en
translationKey: judge-timing-in-rollout
topic: runtime
tags: [Agent RL, 性能分析, 可观测性]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
order: 7
draft: false
review: true
---

Training logs can show an apparently contradictory pair of observations: Judge requests clearly involve waiting, yet the `reward` stage takes almost no time. Scoring intuitively belongs to reward, so it is easy to suspect missing timing data or conclude that scoring costs are negligible.

Before changing the timer, check what it measures. A field name describes an entry point in the code; the interval it wraps may not cover the full cost of the corresponding operation. The key questions are **where scoring is initiated and where the code waits for it to finish.**

## Scoring may already happen inside rollout

Consider a common implementation: after generating an answer, the rollout worker calls Judge directly and returns the score along with the trajectory. Only after the entire batch returns does the driver enter a code block named `reward`.

```text
driver: await rollout_batch(...)
  └─ worker
      ├─ Generate the answer
      ├─ Call Judge and wait for the score
      └─ Return the trajectory and score

driver: reward
  └─ Read the score already returned in the batch
```

In this call chain, the wait for Judge happens before `rollout_batch` returns. The driver's later reward entry point only needs to retrieve the scores and organize tensors, which can naturally be quick. Its timer measures that small piece of work, not the time already spent producing the scores.

This is one particular organization of the calls, not a description of every training framework. If another implementation calls Judge synchronously inside the driver, the timing attribution will differ. Start from the actual call and wait locations.

## The two timers cover different intervals

The structure becomes clearer in a small piece of pseudocode:

```python
async def train_step(prompts):
    with timer("generate"):
        batch = await generate_and_score(prompts)
    with timer("reward"):
        rewards = [item.score for item in batch]
    return rewards
```

The implementations of `timer` and the service calls are omitted here; the example only shows which code each timer surrounds. If a timer takes the difference between two calls to [`time.perf_counter()`](https://docs.python.org/3/library/time.html#time.perf_counter), it measures elapsed time over that interval, including waits. It does not reach back and include work that already happened in the preceding block.

Two concurrent workers make the containment relationship more concrete. **Every time in the following table is synthetic and illustrates timing boundaries; none is an actual measurement.** Assume a shared clock origin and omit other costs such as transfer and cleanup. Each worker starts its own Judge request only after generation finishes.

| Interval | Start and end times (seconds) | Duration (seconds) |
|---|---|---:|
| A generates | `0 → 2` | `2` |
| A waits for Judge | `2 → 5` | `3` |
| B generates | `0 → 1` | `1` |
| B waits for Judge | `1 → 4` | `3` |
| The driver's `generate` waits for the whole batch | `0 → 5` | `5` |
| The driver's `reward` reads prepared scores | `5 → 5.01` | `0.01` |

A returns at second `5`, while B has already returned at second `4`, so the driver waits until second `5`. Each Judge call takes `3` seconds, giving `6` seconds of cumulative request time. This does not make the driver wait an additional `6` seconds: the calls overlap between seconds `2` and `4`, and both are already inside `generate`.

In this simplified example, the two driver intervals total `5.01` seconds. Writing `5 + 6 + 0.01` counts the Judge waits twice. Taking the maximum Judge duration, `3` seconds, as the duration of `generate` is also incorrect: it ignores the preceding generation and the calls' different start times.

Thus, `generate=5` and `reward=0.01` can both be correct. The former contains generation and scoring waits; the latter contains only result retrieval. What needs correction may be the interpretation of the field in a report, rather than the function itself.

The same pattern appears in prefetching and caching. Retrieving an object that is already prepared can be quick even when preparing it was expensive. Timing only the final read answers a question about read latency, not preparation cost.

## Attribute the wait to the right stage

A practical approach is to retain the driver's overall interval, add a separate span around the actual Judge request in the worker, and correlate the records with a request identifier. Then distinguish client retries, server queueing, and response delivery at boundaries that are actually observable. When only a client's total duration is available, retain that total instead of guessing which internal stage it represents.

For example, a span from the client sending a request to receiving a valid score tells us how long that call waited. It cannot, on its own, separate server queueing, model computation, and network transfer. Those components require correlated stage records from the relevant side. Raw timestamps from different machines should not be subtracted without first establishing the clock conditions.

Preserve the containment relationship when interpreting the results. A Judge span already inside `generate` must not be added again as extra time in the full training step. With multiple workers scoring concurrently, the sum of individual request durations may also exceed the batch's wall-clock time. Concurrent waits such as [`asyncio.gather()`](https://docs.python.org/3/library/asyncio-task.html#running-tasks-concurrently) allow those request intervals to overlap.

A display could explicitly label one field “generation, including the wait for scoring in postprocessing” and another “materializing returned scores,” rather than letting similar names imply identical scope. Counts should also distinguish client attempts from scoring tasks, so retries do not blur timing and counting once more.

When a stage number looks unexpectedly small, identify where its timer starts, where it ends, and where the actual wait occurs. Once those boundaries line up, the number can answer the question you intended to ask.
