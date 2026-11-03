#!/usr/bin/env python3
"""Check Python module-reference restoration in isolated local child processes.

This uses cloudpickle and a generated synthetic state module. It does not import
Ray, create an Actor/cluster, load a checkpoint, or contact a service. Only
payloads created by this script are unpickled. Printed output contains no paths.
"""

import importlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile

import cloudpickle


MODULE = '''from dataclasses import dataclass
@dataclass
class ResumeState:
    cursor: int
    pending: tuple[str, ...]
'''

WORKER = '''import importlib
import json
from pathlib import Path
import sys
import cloudpickle

mode, module_directory, payload_file = sys.argv[1:]
events = []
payload = Path(payload_file).read_bytes()

def bootstrap():
    events.append("bootstrap")
    sys.path.insert(0, module_directory)
    importlib.invalidate_caches()

def restore_trusted_state(payload, prepare):
    if not isinstance(payload, bytes):
        raise TypeError("expected serialized internal state")
    prepare()
    from blog_example_state import ResumeState
    events.append("decode")
    restored = cloudpickle.loads(payload)
    events.append("validate")
    if not isinstance(restored, ResumeState):
        raise TypeError("unexpected restored state type")
    if type(restored.cursor) is not int or restored.cursor < 0:
        raise ValueError("invalid cursor")
    if not isinstance(restored.pending, tuple) or not all(
        isinstance(item, str) for item in restored.pending
    ):
        raise ValueError("invalid pending members")
    return restored

class Consumer:
    def __init__(self, restored):
        events.append("constructor")
        self.cursor = restored.cursor
        self.pending = list(restored.pending)

try:
    if mode == "early":
        events.append("decode")
        restored = cloudpickle.loads(payload)
    else:
        restored = restore_trusted_state(payload, bootstrap)
    consumer = Consumer(restored)
    result = {"status": "restored", "type": type(restored).__name__,
              "cursor": consumer.cursor, "pending": consumer.pending}
except Exception as error:
    result = {"status": "error", "error_type": type(error).__name__}
    if isinstance(error, ModuleNotFoundError):
        result["missing_module"] = error.name
result["events"] = events
print(json.dumps(result))
'''


def main():
    checks = []

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    with tempfile.TemporaryDirectory(prefix="blog-state-demo-") as temp:
        folder = Path(temp)
        modules = folder / "modules"
        empty = folder / "worker-cwd"
        modules.mkdir()
        empty.mkdir()
        (modules / "blog_example_state.py").write_text(MODULE)
        worker = folder / "worker.py"
        worker.write_text(WORKER)
        if "blog_example_state" in sys.modules:
            raise RuntimeError("example module was already imported")
        sys.path.insert(0, str(modules))
        try:
            importlib.invalidate_caches()
            cls = importlib.import_module("blog_example_state").ResumeState
            original = cls(cursor=7, pending=("a", "b"))
            payloads = {
                "valid": cloudpickle.dumps(original),
                "wrong_type": cloudpickle.dumps({"cursor": 7, "pending": ("a", "b")}),
                "negative_cursor": cloudpickle.dumps(cls(-1, ("a", "b"))),
                "invalid_members": cloudpickle.dumps(cls(7, ["a", "b"])),
                "invalid_bytes": b"not-a-pickle",
            }
        finally:
            sys.path.remove(str(modules))
            sys.modules.pop("blog_example_state", None)

        def run(mode, payload_name):
            file = folder / (payload_name + ".bin")
            file.write_bytes(payloads[payload_name])
            completed = subprocess.run(
                [sys.executable, "-I", "-B", str(worker), mode, str(modules), str(file)],
                cwd=empty,
                env={**os.environ, "CUDA_VISIBLE_DEVICES": ""},
                capture_output=True, text=True, timeout=15, check=True,
            )
            if completed.stderr:
                raise RuntimeError("unexpected child-process stderr")
            return json.loads(completed.stdout)

        early = run("early", "valid")
        delayed = run("delayed", "valid")
        check("missing_module_fails_during_decode", early.get("error_type") == "ModuleNotFoundError")
        check("failure_names_generated_module", early.get("missing_module") == "blog_example_state")
        check("constructor_not_reached_on_early_failure", early["events"] == ["decode"])
        check("bootstrap_precedes_decode_and_validation", delayed["events"] == ["bootstrap", "decode", "validate", "constructor"])
        check("delayed_decode_restores_state", delayed["status"] == "restored")
        check("state_type_preserved", delayed["type"] == "ResumeState")
        check("cursor_preserved_not_reset", delayed["cursor"] == 7)
        check("pending_order_preserved", delayed["pending"] == ["a", "b"])
        check("original_object_unchanged", original.cursor == 7 and original.pending == ("a", "b"))

        rejected = {}
        for name, expected in (("wrong_type", "TypeError"), ("negative_cursor", "ValueError"),
                               ("invalid_members", "ValueError"), ("invalid_bytes", "UnpicklingError")):
            result = run("delayed", name)
            rejected[name] = result
            check(name + "_rejected", result.get("error_type") == expected)
            check(name + "_does_not_reach_constructor", "constructor" not in result["events"])

    print(json.dumps({
        "python_version": platform.python_version(),
        "cloudpickle_version": cloudpickle.__version__,
        "scope": "Synthetic Python module-reference roundtrip and validation; no Ray runtime or checkpoint execution.",
        "ray_runtime_executed": False,
        "observed": {"decode_before_bootstrap": early, "decode_after_bootstrap": delayed, "rejected": rejected},
        "check_count": len(checks), "checks": checks, "status": "passed",
    }, indent=2))


if __name__ == "__main__":
    main()
