---
title: "Why does queued work still run after the request is cancelled?"
description: "An A/B queueing example with explicit synchronization points separates cancelling a wait, cancelling pending work, and the completion of running work."
category: technical
lang: en
translationKey: cancelled-queued-work
topic: runtime
tags: [asyncio, 并发, 取消]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:19:23+08:00"
order: 3
draft: false
review: true
---

A tool call has already timed out and returned, yet its request appears in the background logs afterward. The gap may be inside the current process: the caller has given up on the result, but the work producing that result has not received the cancellation.

We encountered exactly such a gap between two queues. A job had left the dispatcher's queue but was still waiting for capacity in the executor. The outer layer cleaned up its own result channel and queue without finding the execution task it had already dispatched. To explain the problem, we first need to separate several operations that are all called “cancellation.”

## Identify the object being cancelled

A dispatcher can give the caller a result `Future`, create a separate task or submit work to a thread pool, and fill in the result when that work finishes. **Writing a result into a Future does not automatically establish a cancellation relationship.** This is particularly important for a result channel created by application code.

| Object | What cancellation tells us |
|---|---|
| An `asyncio.Task` waiting for a result | A cooperative cancellation request has been made; wait for it to be handled and confirm the terminal state |
| A thread-pool work `Future` that has not started | If `cancel()` succeeds, the executor will not invoke that work |
| Thread-pool work that is already running | `cancel()` cannot interrupt the function that is executing |

An `asyncio.Future` and a `concurrent.futures.Future` are different kinds of objects. For the former and for Tasks, cancellation propagation depends on the actual `await` chain, wrappers, and shielding. For the latter, returned by `Executor.submit()`, the [official API](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.Future.cancel) explicitly distinguishes pending work from running work: a call that is already running or has finished running cannot be cancelled by this operation, which returns `False`.

Likewise, the return of `Task.cancel()` does not mean cancellation has finished. The coroutine still needs a chance to run, perform cleanup, and may even suppress cancellation. [Python's task documentation](https://docs.python.org/3/library/asyncio-task.html#task-cancellation) recommends propagating `CancelledError` after cleanup.

Monitoring records should identify the object as well. A bare `cancelled=true` does not tell us whether it describes the caller task, the result channel, or the executor Future. Record their states separately and correlate them with the same request identifier. That makes it possible to locate where cancellation stopped; the outermost boolean cannot stand in for the whole chain.

## Use synchronization points to order A and B

The following independent example uses only the standard library. The pool has one worker, which A keeps occupied using an event, so B can only queue. `result_channel` is a manually created result channel for the test. A callback transfers B's successful result into it; it does not represent B's execution state.

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

assert case(False) is True   # Cancelling only the result channel still lets B run
assert case(True) is False  # Cancelling the pending work prevents B from running
```

`a_entered` confirms that A has started; `release_a` controls when it can finish. [`Event.wait()`](https://docs.python.org/3/library/threading.html#event-objects) waits for an explicit state. The five-second timeout only guards against a hung wait; synchronization does not depend on sleeping for a while and guessing that the thread has started. When cancellation is checked, A still occupies the only worker, so B cannot race ahead and start running.

Leaving the pool's `with` block waits for the work to finish, so the observation window is closed when `b_called` is checked at the end. The two assertions express the distinction: cancelling the result channel merely discards the late result; cancelling B's work Future prevents that queued invocation. The example covers successful functions and cancellation, omitting the exception forwarding and retry logic of a production dispatcher.

The `done()` check is safe here because both paths cancel the result channel first. If B is left queued, it can finish only after A is released. If B is cancelled while pending, `fb.cancel()` can invoke its [completion callback](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.Future.add_done_callback) immediately, without waiting for A to finish. In both paths, the result channel is already done when the callback runs. In production, cancellation and result delivery may happen concurrently. Checking a state and then writing a result is not one atomic operation; they need coordination according to the event-loop or locking contract of the result object. [`set_result()`](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.Future.set_result) raises `InvalidStateError` on a Future that is already done, so this controlled example's callback is not a general solution to that race.

## Handle cancellation propagation and capacity release separately

When integrating this with an asynchronous dispatcher, each job should retain its own execution handle. After the caller cancels, the dispatch layer finds that job and notifies its queued work to stop. Work that has already been dispatched cannot be handled solely by removal from the original queue. Shared probe coroutines and management tasks still serve other jobs and must not be cancelled along with it.

Testing the propagation chain also requires synchronization points. First confirm that B has reached the waiting location under test. Then cancel the caller and `await` its terminal state. Next wait for the execution layer to confirm that cancellation was received and the queued work will not start. Only then release A. Waiting solely for the caller's `CancelledError` may still precede the execution layer's handling of cancellation. Replacing this confirmation with a fixed `sleep` lets scheduling races determine the test result.

Each confirmation point needs a timeout. If it is not reached, fail the test instead of releasing A along the normal success path. Cleanup in `finally` must still unblock A and wait for work to finish.

Once B has entered a blocking thread, the criterion becomes when the actual work ends. If `cfuture.cancel()` returns `False`, do not label that as successful cancellation or conclude that the function has finished. [AnyIO's thread documentation](https://anyio.readthedocs.io/en/stable/threads.html#running-a-function-in-a-worker-thread) makes the same distinction: allowing the waiter to exit can leave the thread running.

Conversely, `False` alone does not prove that work is still running: completed work also rejects cancellation. Check `running()`, `done()`, and `cancelled()` together. In the example, A's start event has been set and its release event has not, which is what establishes that A is still executing. `done()` includes both completion and successful cancellation, so it cannot simply be read as “the work function finished executing.”

For a custom concurrency limit, capacity must remain owned by the actual work in the executor until the function or its cleanup finishes. Returning the slot as soon as the outer coroutine exits allows new work to enter while the old work is still executing. The thread pool manages whether its workers are busy; any additional semaphore or permit must not be marked available prematurely either.

To check cancellation, observe whether queued work starts, when running work ends, and whether other jobs can still complete. These checks cover relationships within the process. A local cancellation exception does not prove that a proxy, an HTTP connection, and remote computation have all stopped.
