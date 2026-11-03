#!/usr/bin/env python3
"""Standard-library checks for the article's synthetic padding example.

These checks cover the intent of the article's pytest examples without requiring
pytest. They do not rerun the original production fixture suite or framework.
"""

import json
import platform
from unittest.mock import Mock, patch


class InvalidPadding(ValueError):
    def __init__(self, stage):
        self.stage = stage
        super().__init__("padding must be masked out")


def materialize(mask):
    if not isinstance(mask, list) or len(mask) != 3:
        raise TypeError("expected a three-element list")
    if mask[-1] != 0:
        raise InvalidPadding("materialize")
    return {"mask": tuple(mask)}


def postcheck(view):
    if view["mask"][-1] != 0:
        raise InvalidPadding("postcheck")
    return view


def process(mask):
    return postcheck(materialize(mask))


def expect_error(error_type, operation, message=None):
    """Require the expected type and optional exact message; propagate others."""
    try:
        operation()
    except error_type as error:
        if message is not None and str(error) != message:
            raise AssertionError("unexpected rejection message") from error
        return error
    raise AssertionError(f"expected {error_type.__name__}")


def main():
    checks = []

    def check(name, condition):
        if not bool(condition):
            raise AssertionError(name)
        checks.append(name)

    valid = [1, 1, 0]
    invalid_padding = [1, 1, 1]
    valid_before = valid.copy()
    invalid_before = invalid_padding.copy()
    check("control_differs_only_at_padding_position", valid[:-1] == invalid_padding[:-1] and valid[-1] == 0 and invalid_padding[-1] == 1)

    # Observe the unchanged toy process function, wrapping only its postcheck.
    postcheck_spy = Mock(wraps=postcheck)
    with patch.dict(process.__globals__, {"postcheck": postcheck_spy}):
        valid_view = process(valid)
        valid_postcheck_calls = postcheck_spy.call_count
        check("valid_input_produces_expected_view", valid_view == {"mask": (1, 1, 0)})
        check("valid_input_reaches_postcheck", valid_postcheck_calls == 1)

        postcheck_spy.reset_mock()
        early = expect_error(
            InvalidPadding,
            lambda: process(invalid_padding),
            "padding must be masked out",
        )
        invalid_postcheck_calls = postcheck_spy.call_count
        check("integration_rejection_stage_is_materialize", early.stage == "materialize")
        check("early_rejection_does_not_call_postcheck", invalid_postcheck_calls == 0)

    late = expect_error(
        InvalidPadding,
        lambda: postcheck({"mask": (1, 1, 1)}),
        "padding must be masked out",
    )
    check("direct_postcheck_rejects_invalid_padding", late.stage == "postcheck")
    check("early_and_late_share_reason_but_not_stage", type(early) is type(late) and str(early) == str(late) and early.stage != late.stage)

    shape_error = expect_error(
        TypeError,
        lambda: process(None),
        "expected a three-element list",
    )
    check("None_is_a_shape_error_not_a_padding_case", type(shape_error) is TypeError and not isinstance(shape_error, InvalidPadding))

    for name, value in [
        ("short_list", [1, 0]),
        ("long_list", [1, 1, 1, 0]),
        ("tuple", (1, 1, 0)),
    ]:
        error = expect_error(
            TypeError,
            lambda value=value: process(value),
            "expected a three-element list",
        )
        check(f"reject_{name}_as_shape_error", type(error) is TypeError)

    # A missing view field is unrelated to padding and must not be swallowed.
    try:
        expect_error(InvalidPadding, lambda: postcheck({}))
    except KeyError as error:
        check("unrelated_KeyError_is_not_swallowed", error.args == ("mask",))
    else:
        raise AssertionError("unrelated KeyError was swallowed")

    # The helper must also fail if an expected exception never occurs.
    try:
        expect_error(InvalidPadding, lambda: process(valid))
    except AssertionError as error:
        check("missing_expected_exception_fails_the_check", str(error) == "expected InvalidPadding")
    else:
        raise AssertionError("missing exception was accepted")

    check("valid_input_is_unchanged", valid == valid_before)
    check("invalid_input_is_unchanged", invalid_padding == invalid_before)

    print(json.dumps({
        "python_version": platform.python_version(),
        "scope": "synthetic padding checks using the standard library; not a production pytest-suite rerun",
        "check_count": len(checks),
        "checks": checks,
        "observed": {
            "valid_view": valid_view,
            "integration_error": {"type": type(early).__name__, "stage": early.stage, "message": str(early)},
            "direct_postcheck_error": {"type": type(late).__name__, "stage": late.stage, "message": str(late)},
            "shape_error": {"type": type(shape_error).__name__, "message": str(shape_error)},
            "postcheck_calls_for_valid_input": valid_postcheck_calls,
            "postcheck_calls_for_invalid_padding": invalid_postcheck_calls,
            "message_check": "exact equality, equivalent here to the article's anchored literal regex",
        },
    }, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
