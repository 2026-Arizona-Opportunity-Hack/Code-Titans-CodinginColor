import pytest

from cic.errors import ValidationError
from cic.keys import (assessment_sk, assignment_sk, decode_submission_id, encode_submission_id, safe_id,
                      submission_sk)


def test_safe_id_blocks_key_injection():
    assert safe_id("abc-123_X") == "abc-123_X"
    for bad in ("a#b", "", "x" * 65, "a b", "../x", None):
        with pytest.raises(ValidationError):
            safe_id(bad)


def test_keys_sort_in_order():
    assert assignment_sk(2, "m") < assignment_sk(10, "m")
    assert submission_sk("a", 9) < submission_sk("a", 10)
    with pytest.raises(ValidationError):
        assessment_sk("m", "mid")


def test_submission_id_round_trip_and_validation():
    sid = encode_submission_id("stu-1", "a-ws", 1700000000000)
    assert decode_submission_id(sid) == ("stu-1", "a-ws", 1700000000000)
    for bad in ("x", "a:b", "a:b:c", "a#:b:1"):
        with pytest.raises(ValidationError):
            decode_submission_id(bad)
