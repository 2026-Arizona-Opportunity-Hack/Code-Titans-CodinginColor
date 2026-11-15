"""Issue a student's secret words, unique within a class. Only the HMAC is stored."""
from typing import Iterable, Tuple

from .identity import credential_hmac
from .words import generate_words


def issue(class_id: str, taken_hmacs: Iterable[str]) -> Tuple[str, str]:
    """Return (words, hmac) where the hmac is not already used in the class."""
    taken = set(taken_hmacs)
    for _ in range(50):
        words = generate_words()
        digest = credential_hmac(class_id, words)
        if digest not in taken:
            return words, digest
    raise RuntimeError("Could not issue a unique credential")
