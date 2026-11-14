"""Make the shared layer importable as `cic` when running pytest from backend/."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "lambda" / "shared-layer" / "python"))
sys.path.insert(0, str(BACKEND / "lambda"))
