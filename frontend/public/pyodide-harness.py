"""Runs one piece of student code inside Pyodide. Loaded by pyodide-worker.js.

run() executes the code in a fresh namespace, with the student's input() answered from a
list of lines and everything they print captured. It never raises: it returns JSON with the
output, and the error and line number if the code failed. Output is capped, so a loop that
prints forever stops itself. A loop that prints nothing is stopped from outside by the page,
which ends the worker after a few seconds.
"""
import builtins
import contextlib
import io
import json
import sys

FILENAME = "<your code>"
OUTPUT_LIMIT = 20000


class OutputLimit(BaseException):
    """Raised inside print() once the cap is reached. A BaseException, so `except Exception` cannot swallow it."""


class _Capture(io.TextIOBase):
    def __init__(self):
        self.parts = []
        self.size = 0

    def writable(self):
        return True

    def write(self, text):
        room = OUTPUT_LIMIT - self.size
        if room <= 0:
            raise OutputLimit()
        self.parts.append(text[:room])
        self.size += min(len(text), room)
        if len(text) > room:
            raise OutputLimit()
        return len(text)

    def getvalue(self):
        return "".join(self.parts)


def run(code, stdin_text="", expression=None):
    out = _Capture()
    lines = stdin_text.split("\n") if stdin_text else []
    if lines and lines[-1] == "":
        lines.pop()
    result = {"stdout": "", "error": None, "line": None, "value": None, "truncated": False}

    def fake_input(prompt=""):
        if prompt:
            sys.stdout.write(str(prompt))
        if not lines:
            raise EOFError("EOF when reading a line (the program asked for more input than was given)")
        return lines.pop(0)

    real_input, real_stdin = builtins.input, sys.stdin
    builtins.input = fake_input
    sys.stdin = io.StringIO(stdin_text)
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            try:
                namespace = {"__name__": "__main__"}
                exec(compile(code, FILENAME, "exec"), namespace)
                if expression is not None:
                    value = eval(compile(expression, "<test>", "eval"), namespace)
                    result["value"] = {"repr": repr(value), "str": str(value)}
            except OutputLimit:
                result["truncated"] = True
            except SystemExit:
                pass
            except SyntaxError as err:
                result["error"] = "SyntaxError: " + str(err.msg)
                result["line"] = err.lineno
            except BaseException as err:  # noqa: BLE001 - whatever the student's code raised
                result["error"] = type(err).__name__ + ": " + str(err)
                tb = err.__traceback__
                while tb is not None:
                    if tb.tb_frame.f_code.co_filename == FILENAME:
                        result["line"] = tb.tb_lineno
                    tb = tb.tb_next
    finally:
        builtins.input, sys.stdin = real_input, real_stdin
    result["stdout"] = out.getvalue()
    return json.dumps(result)
