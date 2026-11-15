import pytest

from cic import words
from cic.errors import InvalidCredentials, LoginThrottled


def test_wordlist_is_2048_unique_lowercase_words():
    assert len(words.WORDS) == 2048 == len(set(words.WORDS))
    assert all(w.isalpha() and w.islower() for w in words.WORDS)


def test_generated_words_roundtrip():
    code = words.generate_words()
    assert len(code.split("-")) == 3
    assert words.normalize_words(code) == code


def test_normalize_accepts_spaces_hyphens_and_case():
    a, b, c = words.WORDS[:3]
    assert words.normalize_words(f"{a.upper()}  {b}-{c}") == f"{a}-{b}-{c}"


@pytest.mark.parametrize("raw", [None, 5, "", "one-two", "x" * 100, "not-a-real-word"])
def test_normalize_rejects_bad_input(raw):
    assert words.normalize_words(raw) is None


def test_class_code_normalization():
    assert words.normalize_class_code("k7m4-qx") == "K7M4QX"
    assert words.normalize_class_code("!!") is None
    assert words.normalize_class_code(None) is None


def test_login_errors_carry_status_codes_and_retry_after():
    assert InvalidCredentials("x").status_code == 401
    err = LoginThrottled(0)
    assert err.status_code == 429 and err.headers["Retry-After"] == "1"
