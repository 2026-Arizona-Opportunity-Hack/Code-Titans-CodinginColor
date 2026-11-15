"""Shape rules for a module document (docs/architecture.md section 6).

check_draft() is for saving: it enforces structure, types, sizes and ids, but lets a
draft be incomplete. publish_problems() (added with publishing) enforces completeness.
Both collect every problem with its path, so the author sees them all at once.

Question types match what the student player grades: mcq (answerKey is one choice id),
multi (a list of choice ids), short (accepted text, one or a list) and numeric (a number,
or {value, tolerance}). Worksheet fields add `text`, a free-text answer for review.
"""
import json
import os
import re
from decimal import Decimal
from typing import Any, List, Optional, Set

MAX_BYTES = 250_000  # below the 256 KB request limit and the 400 KB DynamoDB item limit
MAX_LESSONS, MAX_ACTIVITIES, MAX_QUESTIONS, MAX_CHOICES, MAX_SLIDES = 20, 30, 50, 8, 100
ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CONCEPT = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")  # a YouTube video ID
# A Google Slides embed link, published ("/d/e/...") or shared ("/d/..."). The editor turns any
# Slides link into this form, so nothing else can be embedded in a module.
GOOGLE_SLIDES_EMBED = re.compile(r"^https://docs\.google\.com/presentation/d/(e/)?[A-Za-z0-9_-]{20,}/embed(\?[A-Za-z0-9=&_.-]{0,100})?$")
UPLOAD_KEY = {"pdf": re.compile(r"^curriculum/[a-f0-9]{32}\.pdf$"),  # what the upload route issues
              "pptx": re.compile(r"^curriculum/[a-f0-9]{32}\.pptx$")}


def upload_url_ok(url, kind: str) -> bool:
    """Only files uploaded through our own upload route, served by our CDN."""
    base = os.environ.get("ASSETS_URL", "").rstrip("/")
    return (bool(base) and isinstance(url, str) and url.startswith(base + "/")
            and bool(UPLOAD_KEY[kind].match(url[len(base) + 1:])))

ACTIVITY_TYPES = ("video", "slides", "check", "worksheet", "exit", "assessment")
QUESTION_TYPES = ("mcq", "multi", "short", "numeric")
COMMON = {"activityId", "type", "title", "required", "estimatedMinutes", "body"}
EXTRA_KEYS = {"video": {"provider", "videoId", "minSeconds"}, "slides": {"slides", "minSeconds", "document"},
              "check": {"questions", "passPct"}, "exit": {"questions"}, "assessment": {"role", "questions"},
              "worksheet": {"instructions", "fields", "document"}}
QUESTION_KEYS = {"questionId", "type", "prompt", "choices", "answerKey", "explanation", "concept", "pairKey", "points"}
FIELD_KEYS = {"fieldId", "type", "prompt", "choices", "answerKey", "explanation", "concept", "points"}


def to_decimal(value: Any) -> Any:
    """DynamoDB rejects floats, so convert them (answer keys like 3.14, tolerances, points)."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_decimal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_decimal(v) for v in value]
    return value


def _num(v: Any) -> bool:
    return isinstance(v, (int, float, Decimal)) and not isinstance(v, bool)


class Checker:
    def __init__(self) -> None:
        self.problems: List[dict] = []
        self.ids: Set[str] = set()

    def bad(self, path: str, message: str) -> None:
        self.problems.append({"path": path, "message": message})

    def text(self, obj: dict, key: str, path: str, limit: int, required: bool = False) -> None:
        v = obj.get(key)
        if v is None:
            if required:
                self.bad(f"{path}.{key}", "is required")
        elif not isinstance(v, str) or len(v) > limit:
            self.bad(f"{path}.{key}", f"must be text of at most {limit} characters")

    def whole(self, obj: dict, key: str, path: str, low: int, high: int) -> None:
        v = obj.get(key)
        if v is not None and (isinstance(v, bool) or not isinstance(v, int) or not low <= v <= high):
            self.bad(f"{path}.{key}", f"must be a whole number from {low} to {high}")

    def ident(self, obj: dict, key: str, path: str, unique: bool = True) -> None:
        v = obj.get(key)
        if not isinstance(v, str) or not ID.match(v):
            self.bad(f"{path}.{key}", "must be 1 to 64 letters, digits, - or _")
        elif unique and v in self.ids:
            self.bad(f"{path}.{key}", f"'{v}' is used more than once in this module")
        elif unique:
            self.ids.add(v)

    def unknown(self, obj: dict, allowed: Set[str], path: str) -> None:
        for key in sorted(set(obj) - allowed):
            self.bad(f"{path}.{key}", "is not a known field")

    def choices(self, q: dict, path: str) -> Set[str]:
        raw = q.get("choices")
        if q.get("type") not in ("mcq", "multi"):
            if raw:
                self.bad(f"{path}.choices", "only mcq and multi questions have choices")
            return set()
        if not isinstance(raw, list) or len(raw) > MAX_CHOICES:
            self.bad(f"{path}.choices", f"must be a list of at most {MAX_CHOICES} choices")
            return set()
        seen: Set[str] = set()
        for i, c in enumerate(raw):
            cp = f"{path}.choices[{i}]"
            if not isinstance(c, dict):
                self.bad(cp, "must be an object with id and text")
                continue
            self.unknown(c, {"id", "text"}, cp)
            if not isinstance(c.get("id"), str) or not ID.match(c["id"]) or c["id"] in seen:
                self.bad(f"{cp}.id", "must be a unique id")
            else:
                seen.add(c["id"])
            self.text(c, "text", cp, 500, required=True)
        return seen

    def answer_key(self, q: dict, path: str, choice_ids: Set[str]) -> None:
        key, kind = q.get("answerKey"), q.get("type")
        if key is None or key == "":
            return
        ok = True
        if kind == "mcq":
            ok = isinstance(key, str) and key in choice_ids
        elif kind == "multi":
            ok = isinstance(key, list) and bool(key) and all(isinstance(k, str) and k in choice_ids for k in key)
        elif kind == "short":
            items = key if isinstance(key, list) else [key]
            ok = 0 < len(items) <= 20 and all(isinstance(k, str) and 0 < len(k) <= 200 for k in items)
        elif kind == "numeric":
            ok = _num(key) or (isinstance(key, dict) and set(key) <= {"value", "tolerance"} and _num(key.get("value"))
                               and (key.get("tolerance") is None or (_num(key["tolerance"]) and key["tolerance"] >= 0)))
        else:
            ok = False
        if not ok:
            self.bad(f"{path}.answerKey", f"is not a valid answer for a {kind} question")

    def item(self, q: Any, path: str, id_key: str, allowed: Set[str], types: tuple) -> None:
        if not isinstance(q, dict):
            self.bad(path, "must be an object")
            return
        self.unknown(q, allowed, path)
        self.ident(q, id_key, path)
        if q.get("type") not in types:
            self.bad(f"{path}.type", f"must be one of: {', '.join(types)}")
        self.text(q, "prompt", path, 2000, required=True)
        self.text(q, "explanation", path, 2000)
        if q.get("concept") is not None and not (isinstance(q["concept"], str) and CONCEPT.match(q["concept"])):
            self.bad(f"{path}.concept", "must be lowercase letters, digits and hyphens, up to 40 characters")
        if q.get("pairKey") is not None:
            self.ident(q, "pairKey", path, unique=False)
        if q.get("points") is not None and not (_num(q["points"]) and 0 <= q["points"] <= 100):
            self.bad(f"{path}.points", "must be a number from 0 to 100")
        self.answer_key(q, path, self.choices(q, path))

    def document(self, d: Any, path: str) -> None:
        """A slide deck shown instead of typed slides: an uploaded PDF or PowerPoint, or a Google Slides link."""
        if d is None:
            return
        if not isinstance(d, dict):
            self.bad(path, "must be an object with kind and url")
            return
        self.unknown(d, {"kind", "url", "name"}, path)
        self.text(d, "name", path, 200)
        kind, url = d.get("kind"), d.get("url")
        if kind in ("pdf", "pptx"):
            if not upload_url_ok(url, kind):
                self.bad(f"{path}.url", f"must be a {'PDF' if kind == 'pdf' else 'PowerPoint file'} uploaded to this site")
        elif kind == "google":
            if not (isinstance(url, str) and GOOGLE_SLIDES_EMBED.match(url)):
                self.bad(f"{path}.url", "must be a Google Slides link")
        else:
            self.bad(f"{path}.kind", "must be pdf, pptx or google")

    def activity(self, a: Any, path: str) -> None:
        if not isinstance(a, dict):
            self.bad(path, "must be an object")
            return
        kind = a.get("type")
        if kind not in ACTIVITY_TYPES:
            self.bad(f"{path}.type", f"must be one of: {', '.join(ACTIVITY_TYPES)}")
            return
        self.unknown(a, COMMON | EXTRA_KEYS[kind], path)
        self.ident(a, "activityId", path)
        self.text(a, "title", path, 120)
        self.text(a, "body", path, 4000)
        self.whole(a, "estimatedMinutes", path, 1, 120)
        if a.get("required") is not None and not isinstance(a["required"], bool):
            self.bad(f"{path}.required", "must be true or false")
        if kind in ("video", "slides"):
            self.whole(a, "minSeconds", path, 0, 3600)
        if kind == "video":
            if a.get("provider") != "youtube":
                self.bad(f"{path}.provider", "must be youtube")
            vid = a.get("videoId", "")
            if vid != "" and not (isinstance(vid, str) and VIDEO_ID.match(vid)):
                self.bad(f"{path}.videoId", "must be an 11-character YouTube video ID")
        elif kind == "slides":
            self.document(a.get("document"), f"{path}.document")
            slides = a.get("slides", [])
            if not isinstance(slides, list) or len(slides) > MAX_SLIDES:
                self.bad(f"{path}.slides", f"must be a list of at most {MAX_SLIDES} slides")
            else:
                for i, s in enumerate(slides):
                    sp = f"{path}.slides[{i}]"
                    if not isinstance(s, dict):
                        self.bad(sp, "must be an object with title and body")
                        continue
                    self.unknown(s, {"title", "body"}, sp)
                    self.text(s, "title", sp, 120)
                    self.text(s, "body", sp, 4000)
        elif kind == "worksheet":
            self.document(a.get("document"), f"{path}.document")  # the original printed worksheet, shown above the fields
            self.text(a, "instructions", path, 4000)
            fields = a.get("fields", [])
            if not isinstance(fields, list) or len(fields) > MAX_QUESTIONS:
                self.bad(f"{path}.fields", f"must be a list of at most {MAX_QUESTIONS} fields")
            else:
                for i, f in enumerate(fields):
                    self.item(f, f"{path}.fields[{i}]", "fieldId", FIELD_KEYS, ("text",) + QUESTION_TYPES)
        else:
            if kind == "assessment" and a.get("role") not in ("pre", "post"):
                self.bad(f"{path}.role", "must be pre or post")
            if kind == "check" and a.get("passPct") is not None and not (_num(a["passPct"]) and 0 <= a["passPct"] <= 100):
                self.bad(f"{path}.passPct", "must be a number from 0 to 100")
            qs = a.get("questions", [])
            if not isinstance(qs, list) or len(qs) > MAX_QUESTIONS:
                self.bad(f"{path}.questions", f"must be a list of at most {MAX_QUESTIONS} questions")
            else:
                for i, q in enumerate(qs):
                    self.item(q, f"{path}.questions[{i}]", "questionId", QUESTION_KEYS, QUESTION_TYPES)


def check_draft(doc: Any, module_id: str) -> List[dict]:
    """Return the list of problems with a draft (empty when it can be saved)."""
    c = Checker()
    if not isinstance(doc, dict):
        return [{"path": "$", "message": "must be a JSON object"}]
    if len(json.dumps(doc, default=str)) > MAX_BYTES:
        return [{"path": "$", "message": f"is larger than {MAX_BYTES // 1000} KB"}]
    c.unknown(doc, {"moduleId", "title", "description", "estimatedMinutes", "lessons"}, "$")
    if doc.get("moduleId") != module_id:
        c.bad("$.moduleId", "must match the module in the URL")
    c.text(doc, "title", "$", 120, required=True)
    c.text(doc, "description", "$", 1000)
    c.whole(doc, "estimatedMinutes", "$", 1, 600)
    lessons = doc.get("lessons")
    if not isinstance(lessons, list) or not 1 <= len(lessons) <= MAX_LESSONS:
        c.bad("$.lessons", f"must be a list of 1 to {MAX_LESSONS} lessons")
        return c.problems
    lesson_ids: Set[str] = set()
    for i, lesson in enumerate(lessons):
        lp = f"$.lessons[{i}]"
        if not isinstance(lesson, dict):
            c.bad(lp, "must be an object")
            continue
        c.unknown(lesson, {"lessonId", "title", "activities"}, lp)
        lid = lesson.get("lessonId")
        if not isinstance(lid, str) or not ID.match(lid) or lid in lesson_ids:
            c.bad(f"{lp}.lessonId", "must be a unique id")
        else:
            lesson_ids.add(lid)
        c.text(lesson, "title", lp, 120)
        acts = lesson.get("activities")
        if not isinstance(acts, list) or len(acts) > MAX_ACTIVITIES:
            c.bad(f"{lp}.activities", f"must be a list of at most {MAX_ACTIVITIES} activities")
            continue
        for j, a in enumerate(acts):
            c.activity(a, f"{lp}.activities[{j}]")
    return c.problems


def concepts_in(doc: dict) -> List[str]:
    found: Set[str] = set()
    for lesson in doc.get("lessons", []):
        for a in lesson.get("activities", []):
            for q in (a.get("questions") or []) + (a.get("fields") or []):
                if q.get("concept"):
                    found.add(q["concept"])
    return sorted(found)


def estimated_minutes(doc: dict) -> Optional[int]:
    if doc.get("estimatedMinutes"):
        return int(doc["estimatedMinutes"])
    total = sum(int(a.get("estimatedMinutes", 0)) for l in doc.get("lessons", []) for a in l.get("activities", []))
    return total or None


def _blank(value: Any) -> bool:
    return not isinstance(value, str) or not value.strip()


def publish_problems(doc: dict) -> List[dict]:
    """Return what is still missing before a draft can be published (empty when ready).

    Assumes the draft already passed check_draft(), so shapes and types are sound.
    """
    out: List[dict] = []

    def bad(path: str, message: str) -> None:
        out.append({"path": path, "message": message})

    def question_text(q: dict, path: str) -> None:
        if _blank(q.get("prompt")):
            bad(f"{path}.prompt", "is empty")
        if q.get("type") in ("mcq", "multi"):
            choices = q.get("choices") or []
            if len(choices) < 2:
                bad(f"{path}.choices", "needs at least 2 choices")
            for k, c in enumerate(choices):
                if _blank(c.get("text")):
                    bad(f"{path}.choices[{k}].text", "is empty")

    if _blank(doc.get("title")):
        bad("$.title", "is empty")
    flat = [(i, j, a) for i, l in enumerate(doc.get("lessons", [])) for j, a in enumerate(l.get("activities", []))]
    if not flat:
        bad("$.lessons", "needs at least one activity")
    pre_concepts: Set[str] = set()
    post_concepts: Set[str] = set()
    for i, lesson in enumerate(doc.get("lessons", [])):
        if _blank(lesson.get("title")):
            bad(f"$.lessons[{i}].title", "is empty")
        if not lesson.get("activities"):
            bad(f"$.lessons[{i}].activities", "needs at least one activity")
    for i, j, a in flat:
        path, kind = f"$.lessons[{i}].activities[{j}]", a["type"]
        if _blank(a.get("title")):
            bad(f"{path}.title", "is empty")
        if kind == "video" and not (isinstance(a.get("videoId"), str) and VIDEO_ID.match(a["videoId"])):
            bad(f"{path}.videoId", "needs an 11-character YouTube video ID")
        if kind == "slides" and not a.get("document") and not any(not _blank(s.get("body")) for s in a.get("slides") or []):
            bad(f"{path}.slides", "needs a PDF, a PowerPoint file, a Google Slides link, or at least one slide with text")
        if kind == "worksheet":
            if not a.get("fields"):
                bad(f"{path}.fields", "needs at least one field")
            for k, f in enumerate(a.get("fields") or []):
                if f.get("type") == "text":
                    if _blank(f.get("prompt")):
                        bad(f"{path}.fields[{k}].prompt", "is empty")
                else:
                    question_text(f, f"{path}.fields[{k}]")
        if kind in ("check", "exit", "assessment"):
            qs = a.get("questions") or []
            if not qs:
                bad(f"{path}.questions", "needs at least one question")
            for k, q in enumerate(qs):
                qp = f"{path}.questions[{k}]"
                question_text(q, qp)
                needs_key = kind in ("check", "assessment")
                if needs_key and q.get("answerKey") in (None, "", []):
                    bad(f"{qp}.answerKey", "is required")
                if kind == "assessment":
                    if _blank(q.get("concept")):
                        bad(f"{qp}.concept", "is required on assessment questions")
                    elif a.get("role") == "pre":
                        pre_concepts.add(q["concept"])
                    else:
                        post_concepts.add(q["concept"])
                    if not (_num(q.get("points", 1)) and q.get("points", 1) > 0):
                        bad(f"{qp}.points", "must be greater than 0")
    if flat:
        first, last = flat[0][2], flat[-1][2]
        if not (first["type"] == "assessment" and first.get("role") == "pre"):
            bad("$.lessons[0].activities[0]", "the first activity must be the pretest")
        if not (last["type"] == "assessment" and last.get("role") == "post"):
            bad(f"$.lessons[{flat[-1][0]}].activities[{flat[-1][1]}]", "the last activity must be the post-test")
    if pre_concepts != post_concepts:
        bad("$", "the pretest and post-test must cover the same concepts "
                 f"(pretest only: {sorted(pre_concepts - post_concepts)}, post-test only: {sorted(post_concepts - pre_concepts)})")
    return out
