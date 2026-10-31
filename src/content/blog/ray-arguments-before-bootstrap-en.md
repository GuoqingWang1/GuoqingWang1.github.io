---
title: "Why can imports fail before a Ray Actor initializer runs?"
description: "Constructor arguments also need deserialization, so their dependencies may need to be available before Actor initialization begins."
category: technical
topic: training
lang: en
translationKey: ray-arguments-before-bootstrap
tags: [Ray, serialization, 训练恢复]
pubDate: "2026-11-01T06:32:29+08:00"
order: 6
draft: false
review: true
---

During a recovery task, the model state had already loaded, but a subsequent application Actor encountered a module import error during construction. Our code was set up to prepare the environment at the Actor's initialization entry point, but that code never got a chance to run.

The cause lay in the order of operations: the worker must restore constructor arguments before it can pass them to `__init__`. If restoring one of those objects requires an application module that is not yet available, the error occurs before initialization.

## Arguments are dependencies too

[Ray's serialization mechanism](https://docs.ray.io/en/latest/ray-core/objects/serialization.html) uses the pickle protocol and cloudpickle, which can handle many dynamic Python objects. But “the Actor class itself can be loaded” and “all of its arguments can be restored” remain separate questions.

When an argument contains an application object that must be restored through a module reference, the sequence can be:

```text
driver constructs recovery state
  → serialize and send constructor arguments
  → worker restores arguments and tries to import the application module
  → call Actor.__init__
  → prepare the application code environment in the initializer
```

The last step is too late to satisfy the dependency at the third step. Adding a search path inside `__init__`, or writing the same bootstrap logic again, does not change that ordering.

We had already handled loading the Actor class itself. What we missed was a state object nested inside its arguments. Replacing the outer container with a `dict` is not necessarily enough: the dictionary can still contain instances that require the corresponding application module.

## Prepare dependencies before they are needed

Usually, the first option to consider is making dependencies available in the worker's runtime environment ahead of time. Ray's [`runtime_env`](https://docs.ray.io/en/latest/ray-core/handling-dependencies.html) provides a way to configure code and dependencies for tasks or Actors. This is more direct than preparing the environment inside an application constructor.

Another approach, with a specific scope of applicability, is to defer unpacking application state explicitly: the driver first packages that state as bytes; the worker entry point prepares the code environment and only then restores the objects inside.

```text
driver: trusted state → serialized bytes
Ray: transport bytes
worker: prepare application environment → unpack internal state → run original recovery logic
```

What is deferred here is restoration of the application objects. The entry point itself and its minimal dependencies must already be available. The following worker-side helper only illustrates the sequence; `bootstrap` is supplied by startup code that is already available:

```python
import cloudpickle

def restore_trusted_state(payload, bootstrap):
    if not isinstance(payload, bytes):
        raise TypeError("expected serialized internal state")
    bootstrap()
    return cloudpickle.loads(payload)
```

This entry point handles only trusted recovery artifacts produced by the system itself. Bytes provide no security isolation and must not be used as a reason to load pickle data of unknown origin. A new task with no recovery state should continue through its normal path. Invalid recovery data should fail explicitly rather than silently falling back to empty state.

## Validate the restored object, not just constructor success

The fix in that case neither cleared the original cache nor regenerated data. We first retained the negative case showing that directly passing the application object still failed in an environment missing the module. We then checked whether deferred unpacking passed the same failure point.

The positive case cannot stop at whether the Actor is alive. After objects round-trip, the original interface checks still need to cover key tensors and metadata, member order, cache contents, and progress counters. Otherwise, it is easy to mistake a restart from scratch for successful recovery. The subsequent native run must also confirm that these restored states are actually consumed.

Turning a large object into bytes does not remove serialization, transfer, or memory costs. This change addresses the ordering of dependency readiness and unpacking; it should not automatically be presented as a performance optimization.

For a similar import failure, a useful diagnostic question is: **did it occur while restoring the arguments, inside the constructor, or during later use of the restored state?** Separating those three stages helps place the fix where it can take effect in time.
