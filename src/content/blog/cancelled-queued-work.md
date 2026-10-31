---
title: "取消请求后，排队的工作为什么还会执行？"
description: "用带同步点的 A/B 排队例子，区分取消等待、取消尚未开始的工作与运行中工作的结束。"
category: technical
lang: zh-CN
topic: runtime
tags: [asyncio, 并发, 取消]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T06:52:26+08:00"
order: 3
draft: false
review: true
---

工具调用已经超时返回，后台却又出现了它的请求记录。问题可能出在当前进程：调用方放弃了结果，负责生产结果的工作却没有收到取消。

我们曾遇到的缺口就位于两层队列之间。任务离开调度器队列后，仍在执行器里等待名额；外层只清理了自己的结果通道和队列，没有找到已经派发出去的执行任务。要说明这个问题，先得把几个都叫“取消”的动作分开。

## 先确认取消的是哪个对象

调度器可以给调用方一个结果 `Future`，另外创建 task 或提交线程池工作，完成后再把结果填回来。**“向某个 Future 写结果”并不会自动建立取消传播关系。** 自建结果通道尤其需要检查这一点。

| 对象 | 取消能说明什么 |
|---|---|
| 等待结果的 `asyncio.Task` | 发出协作式取消请求，需要等它处理并确认终态 |
| 尚未开始的线程池工作 `Future` | `cancel()` 成功后，执行器不会调用该工作 |
| 已经运行的线程池工作 | `cancel()` 不能中断正在运行的函数 |

这里的 `asyncio.Future` 与 `concurrent.futures.Future` 不是同一种对象。对前者及 Task，要沿实际 `await` 链、包装和屏蔽关系判断传播；对 `Executor.submit()` 返回的后者，[官方接口](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.Future.cancel)明确区分 pending 与 running：运行中或已经完成的工作不能被这次调用取消，会返回 `False`。

同样，`Task.cancel()` 返回并不代表取消已经处理完成。协程还要获得执行机会、进行清理，甚至可能抑制取消。[Python 的任务文档](https://docs.python.org/3/library/asyncio-task.html#task-cancellation)建议清理后继续传播 `CancelledError`。

监控记录也应带上对象层级。单独一个 `cancelled=true`，看不出它描述的是 caller task、结果通道还是执行器 Future。把这些对象的状态分别记录，并用同一个请求标识关联，才能判断取消在哪一层停止；最外层的布尔值不能代替整条链的结果。

## 用同步点固定 A 和 B 的先后关系

下面是一个只用标准库的独立示例。线程池只有一个 worker，A 用事件保持占用，B 因而只能排队。`result_channel` 是测试中手工创建的结果通道，回调负责把 B 的成功结果搬过去；它并不代表 B 的执行状态。

```python
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Event

def case(cancel_work):
    a_entered, release_a, b_called = Event(), Event(), Event()
    result_channel = Future()

    def work_a():
        a_entered.set()
        release_a.wait()

    def work_b():
        b_called.set()
        return "B"

    def publish(done):
        if not result_channel.done():
            result_channel.set_result(done.result())

    with ThreadPoolExecutor(max_workers=1) as pool:
        fa = pool.submit(work_a)
        try:
            if not a_entered.wait(timeout=5):
                raise TimeoutError("A did not start")
            fb = pool.submit(work_b)
            fb.add_done_callback(publish)
            assert not fb.running()
            assert fa.cancel() is False
            assert result_channel.cancel() is True
            if cancel_work:
                assert fb.cancel() is True
            assert not b_called.is_set()
        finally:
            release_a.set()

    assert fa.done() and fb.done()
    return b_called.is_set()

assert case(False) is True   # 只取消结果通道，B 仍执行
assert case(True) is False  # 取消尚未开始的工作，B 不执行
```

`a_entered` 确认 A 已开始；`release_a` 决定它何时结束。[`Event.wait()`](https://docs.python.org/3/library/threading.html#event-objects) 等待的是明确状态，五秒只是防挂起的上限，不是“睡一会儿，估计线程已经启动”。检查取消时，A 仍占着唯一 worker，因此 B 不可能抢先运行。

退出线程池的 `with` 块会等待工作收尾，所以末尾检查 `b_called` 时，观察窗口已经闭合。两条断言表达的区别是：取消结果通道只让迟到结果被丢弃；取消 B 的工作 Future 才阻止了这次排队调用。示例只覆盖成功函数与取消关系，省略了生产调度器的异常转发和重试逻辑。

回调中的 `done()` 检查也依赖这里的同步顺序：结果通道先被取消，A 才被放行，B 的完成回调随后才能发生。生产系统中，取消和结果写入可能并发；检查状态再写入并不是一个原子动作，需要按结果对象所属的事件循环或锁约定协调。[`set_result()`](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.Future.set_result) 对已经结束的 Future 会抛出 `InvalidStateError`，不能把这个受控例子的回调当作通用竞态保护。

## 取消传递与容量释放要分别接上

接回异步调度器时，应由每个 job 保存自己的执行句柄。调用方取消后，调度层找到该 job，通知尚在排队的工作停止；已经派发的任务不能只靠从原队列删除来处理。共用的探测协程和管理任务还服务于其他 job，不能一起取消。

测试这条传播链也需要同步点：先确认 B 已到达被测等待位置，再取消 caller 并 `await` 它的终态；随后等待执行层确认“取消已接收、排队工作不会启动”，最后才放开 A。只等待 caller 的 `CancelledError`，可能仍早于执行层处理取消。用固定 `sleep` 代替这个确认，会让调度竞争决定测试结果。

这些确认点都应设置超时：未到达就让测试失败，不要沿正常路径放行 A；失败后的 `finally` 清理仍须解除阻塞并等待收尾。

如果 B 已进入阻塞线程，判据则变成真实工作何时结束。`cfuture.cancel()` 返回 `False` 时，不能把它标成成功取消，也不能因此宣布工作函数已结束。[AnyIO 的线程文档](https://anyio.readthedocs.io/en/stable/threads.html#running-a-function-in-a-worker-thread)也明确说明：允许等待方退出，线程仍可能继续运行。

反过来，`False` 也不能独自证明工作仍在运行：已经完成的工作同样会拒绝取消。还要结合 `running()`、`done()` 和 `cancelled()` 判断。在示例里，是 A 已发出开始事件、释放事件尚未设置，才让我们确认它仍在执行。`done()` 则包含完成和成功取消两种终态，不能直接当成“工作函数执行完了”。

自建并发限制时，容量必须由执行器中的真实工作持有，直到函数退出或收尾完成。外层协程先返回就归还名额，会让下一项工作进来，而旧工作还在执行。线程池本身管理 worker 是否忙碌；额外加的 semaphore 或 permit 也不能提前记作空闲。

检查取消是否正确，至少要同时看排队工作有没有启动、运行工作何时结束，以及其他 job 能否继续完成。这仍只覆盖进程内关系：本地取消异常并不能证明代理、HTTP 连接和远端计算都已经停止。
