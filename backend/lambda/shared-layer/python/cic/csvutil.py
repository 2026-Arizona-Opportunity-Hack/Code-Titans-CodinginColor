"""CSV helpers. Exports are opened in spreadsheets, so cells that start with a formula
character are neutralized (CSV injection)."""
import csv
import io
from typing import Iterable, List

_DANGEROUS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_DANGEROUS) else text


def to_csv(header: List[str], rows: Iterable[list]) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([safe_cell(c) for c in row])
    return out.getvalue()
