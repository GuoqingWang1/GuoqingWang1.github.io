---
title: "Why can imports fail before a Ray Actor initializer runs?"
description: "A recovery object with a module reference shows why argument unpacking precedes initialization and where dependency setup must happen."
category: technical
topic: training
lang: en
translationKey: ray-arguments-before-bootstrap
tags: [Ray, serialization, 训练恢复]
pubDate: "2026-11-01T06:32:29+08:00"
updatedDate: "2026-11-01T07:53:34+08:00"
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

For example, suppose an application module called `app_state.py` defines this small object. Its fields and values are synthetic:

```python
# app_state.py
from dataclasses import dataclass

@dataclass
class ResumeState:
    cursor: int
    pending: tuple[str, ...]
```

The driver can import the module, so it can create `ResumeState(cursor=7, pending=("a", "b"))`. If the class is serialized by module reference, however, the worker still needs to resolve `app_state.ResumeState` when restoring the instance. Simple data fields do not remove the import requirement of the class itself.

[cloudpickle's documentation](https://github.com/cloudpipe/cloudpickle/blob/master/README.md#overriding-pickles-serialization-mechanism-for-importable-constructs) distinguishes serialization by value from serialization by reference. It can handle dynamic classes by value, but its default use of references for locally importable modules does not ensure that those modules also exist on a remote worker. This discussion concerns **arguments that still require module references**, not a claim that every Python object fails at this stage.

| Constructor argument sent to the Actor | What the worker must restore before entering `__init__` |
|---|---|
| `ResumeState(...)` | The application object and its class reference |
| `{"state": ResumeState(...)}` | The dictionary and the application object inside it |
| The result of `cloudpickle.dumps(state)` | The outer `bytes`; the application object inside waits until explicit unpacking |

The last row changes when unpacking occurs. It does not eliminate the eventual need for the application module.

## Prepare dependencies before they are needed

Usually, the first option to consider is making dependencies available in the worker's runtime environment ahead of time. Ray's [`runtime_env`](https://docs.ray.io/en/latest/ray-core/handling-dependencies.html) provides a way to configure code and dependencies for tasks or Actors. This is more direct than preparing the environment inside an application constructor.

Another approach, with a specific scope of applicability, is to defer unpacking application state explicitly: the driver first packages that state as bytes; the worker entry point prepares the code environment and only then restores the objects inside.

```text
driver: trusted state → serialized bytes
Ray: transport bytes
worker: prepare application environment → unpack internal state → run original recovery logic
```

For the synthetic object above, the driver can package the state as follows:

```python
import cloudpickle
from app_state import ResumeState

state = ResumeState(cursor=7, pending=("a", "b"))
payload = cloudpickle.dumps(state)
```

The worker defers restoration of the application object, but the entry point itself and its minimal dependencies must already be available. In the following worker-local helper, `bootstrap` is supplied by startup code that is already available; it must make the correct version of `app_state` and its dependencies importable:

```python
import cloudpickle

def restore_trusted_state(payload, bootstrap):
    if not isinstance(payload, bytes):
        raise TypeError("expected serialized internal state")
    bootstrap()
    from app_state import ResumeState

    restored = cloudpickle.loads(payload)
    if not isinstance(restored, ResumeState):
        raise TypeError("unexpected restored state type")
    if type(restored.cursor) is not int or restored.cursor < 0:
        raise ValueError("invalid cursor")
    if not isinstance(restored.pending, tuple) or not all(
        isinstance(item, str) for item in restored.pending
    ):
        raise ValueError("invalid pending members")
    return restored
```

These fragments explain the object structure and worker-local ordering; they do not replace the Actor factory or deployment configuration. In particular, do not pass a `bootstrap` function that depends on the same missing module as another remote constructor argument: that can recreate the early-deserialization problem.

This entry point handles only trusted recovery artifacts produced by the system itself. [Unpickling can execute code](https://docs.python.org/3/library/pickle.html), so neither checking for `bytes` nor validating fields after decoding provides security isolation or makes data of unknown origin safe to load. A new task with no recovery state should continue through its normal path. Invalid recovery data should fail explicitly rather than silently falling back to empty state.

## Validate the restored object, not just constructor success

The fix in that case neither cleared the original cache nor regenerated data. We first retained the negative case showing that directly passing the application object still failed in an environment missing the module. We then checked whether deferred unpacking passed the same failure point.

The positive case cannot stop at whether the Actor is alive. After objects round-trip, the original interface checks still need to cover key tensors and metadata, member order, cache contents, and progress counters. Otherwise, it is easy to mistake a restart from scratch for successful recovery. The subsequent native run must also confirm that these restored states are actually consumed.

The synthetic object above should restore `cursor == 7` and `pending == ("a", "b")`, rather than produce a fresh object with `cursor == 0`. Tests can cover three levels: retain the failure of direct object transport when the module is absent; check that deferred unpacking follows bootstrap → import/decode → original restore validation; then compare fields and member order and have the actual consumer read the restored contents.

Entry logs can mark these three stages instead of reporting only “restore failed” around the whole construction process. Provided logging itself is reliable, whether the first initializer log appears can help narrow down the failure stage. It does not replace the actual traceback.

Turning a large object into bytes does not remove serialization, transfer, or memory costs. This change addresses the ordering of dependency readiness and unpacking; it should not automatically be presented as a performance optimization.

For a similar import failure, a useful diagnostic question is: **did it occur while restoring the arguments, inside the constructor, or during later use of the restored state?** Separating those three stages helps place the fix where it can take effect in time.
