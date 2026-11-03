#!/usr/bin/env python3
"""Synthetic, standard-library-only check of two cancellation cases.

case(False, ...) returns True: cancelling only its result channel lets B run.
case(True, ...) returns False: additionally cancelling pending B prevents its run.
Events establish the order; timeouts are failure bounds, not timing estimates.
"""

from concurrent.futures import CancelledError, Future, ThreadPoolExecutor
import json
import platform
from threading import Event


WAIT_SECONDS = 5
A_RELEASE_TIMEOUT = 3 * WAIT_SECONDS


def state(future):
    return {
        "running": future.running(),
        "done": future.done(),
        "cancelled": future.cancelled(),
    }


def outcome(future):
    try:
        return {"status": "returned", "value": future.result(timeout=WAIT_SECONDS)}
    except CancelledError:
        return {"status": "cancelled"}
    except Exception as error:
        return {"status": "error", "error_type": type(error).__name__}


def case(cancel_work, record, checks):
    a_entered, release_a, a_exited = Event(), Event(), Event()
    b_called, callback_finished = Event(), Event()
    result_channel = Future()
    callback = {"called": False, "skipped_done_channel": False, "errors": []}
    record.update({
        "name": "cancel_pending_work" if cancel_work else "result_channel_only",
        "cancel_work": cancel_work,
        "cancel_returns": {},
        "callback": callback,
        "errors": [],
    })

    def check(name, passed):
        checks[record["name"] + "." + name] = bool(passed)

    def work_a():
        a_entered.set()
        try:
            if not release_a.wait(timeout=A_RELEASE_TIMEOUT):
                raise TimeoutError("A was not released")
            return "A"
        finally:
            a_exited.set()

    def work_b():
        b_called.set()
        return "B"

    def publish(done):
        # The result channel is cancelled before B can complete in either case.
        # This controlled ordering is not a general check-then-set race solution.
        callback["called"] = True
        try:
            if result_channel.done():
                callback["skipped_done_channel"] = True
            else:
                result_channel.set_result(done.result())
        except Exception as error:
            callback["errors"].append(type(error).__name__)
        finally:
            callback_finished.set()

    fb = None
    with ThreadPoolExecutor(max_workers=1) as pool:
        fa = pool.submit(work_a)
        try:
            started = a_entered.wait(timeout=WAIT_SECONDS)
            check("a_started", started)
            if not started:
                raise TimeoutError("A did not start")

            fb = pool.submit(work_b)
            fb.add_done_callback(publish)
            record["before_cancel"] = {
                "a": state(fa),
                "b": state(fb),
                "result_channel": state(result_channel),
            }
            check("a_running_before_cancel", fa.running() and not fa.done())
            check("b_pending_before_cancel", not fb.running() and not fb.done())
            check("channel_pending_before_cancel", not result_channel.done())

            # Keep side effects outside assertions: python -O must not remove them.
            record["cancel_returns"]["running_a"] = fa.cancel()
            record["cancel_returns"]["result_channel"] = result_channel.cancel()
            record["cancel_returns"]["pending_b"] = fb.cancel() if cancel_work else None
            check("running_a_cancel_rejected", record["cancel_returns"]["running_a"] is False)
            check("channel_cancel_accepted", record["cancel_returns"]["result_channel"] is True)
            check("pending_b_cancel_result", record["cancel_returns"]["pending_b"] is (True if cancel_work else None))
            check("channel_cancelled", result_channel.cancelled())
            check("b_cancelled_before_release", fb.cancelled() is cancel_work)
            check("a_still_running", fa.running() and not a_exited.is_set())
            check("b_not_called_before_release", not b_called.is_set())
            record["before_release"] = {
                "a": state(fa),
                "b": state(fb),
                "result_channel": state(result_channel),
                "b_called": b_called.is_set(),
            }
        except Exception as error:
            record["errors"].append(type(error).__name__)
        finally:
            release_a.set()

        # Future completion precedes callbacks, so confirm callback completion too.
        record["results"] = {"a": outcome(fa)}
        if fb is not None:
            record["results"]["b"] = outcome(fb)
            check("callback_finished_in_time", callback_finished.wait(timeout=WAIT_SECONDS))
        else:
            record["results"]["b"] = {"status": "not_submitted"}
            check("callback_finished_in_time", False)
        record["results"]["result_channel"] = outcome(result_channel)

    # The executor has joined its worker; there is no later B invocation to miss.
    record["final"] = {
        "a": state(fa),
        "b": state(fb) if fb is not None else None,
        "result_channel": state(result_channel),
        "a_exited": a_exited.is_set(),
        "b_called": b_called.is_set(),
    }
    record["return_value"] = b_called.is_set()
    check("a_finished_normally", fa.done() and not fa.cancelled() and a_exited.is_set()
          and record["results"]["a"] == {"status": "returned", "value": "A"})
    check("b_terminal", fb is not None and fb.done() and not fb.running())
    check("b_final_cancellation", fb is not None and fb.cancelled() is cancel_work)
    check("b_result", record["results"]["b"] == (
        {"status": "cancelled"} if cancel_work else {"status": "returned", "value": "B"}))
    check("b_execution_matches_case", record["return_value"] is (not cancel_work))
    check("channel_stays_cancelled", result_channel.done() and result_channel.cancelled()
          and record["results"]["result_channel"] == {"status": "cancelled"})
    check("callback_skipped_cancelled_channel", callback["called"] and callback["skipped_done_channel"])
    check("no_callback_errors", not callback["errors"])
    check("no_case_errors", not record["errors"])
    return b_called.is_set()


def main():
    cases, checks = [], {}
    for cancel_work in (False, True):
        record = {}
        record["return_value"] = case(cancel_work, record, checks)
        cases.append(record)
    print(json.dumps({
        "python_version": platform.python_version(),
        "cases": cases,
        "checks": checks,
        "check_count": len(checks),
    }, indent=2))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
