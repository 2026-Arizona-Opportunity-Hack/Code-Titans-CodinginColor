"""Secret words: three words from a 2,048-word list (about 33 bits)."""
import os
import re
import secrets

_PATH = os.path.join(os.path.dirname(__file__), "wordlist.txt")
with open(_PATH, encoding="utf-8") as _f:
    WORDS = tuple(line.strip() for line in _f if line.strip())
_WORD_SET = frozenset(WORDS)
WORDS_PER_CODE = 3


def generate_words():
    return "-".join(secrets.choice(WORDS) for _ in range(WORDS_PER_CODE))


def normalize_words(raw):
    """Return 'a-b-c' for valid input, else None. Accepts spaces or hyphens, any case."""
    if not isinstance(raw, str) or len(raw) > 64:
        return None
    parts = [p for p in re.split(r"[\s\-]+", raw.strip().lower()) if p]
    if len(parts) != WORDS_PER_CODE or any(p not in _WORD_SET for p in parts):
        return None
    return "-".join(parts)


def normalize_class_code(raw):
    if not isinstance(raw, str):
        return None
    code = re.sub(r"[\s\-]", "", raw).upper()
    return code if re.fullmatch(r"[A-Z0-9]{4,12}", code) else None
