"""Pure progress logic: module and activity states, unlocking, and the resume pointer.

No AWS calls here, so the rules from docs/architecture.md section 7.1 and 7.2 are
easy to test. Callers load the data and pass it in.

Rules
- An activity is open when every earlier *required* activity in its module is complete.
  (The pretest is first and the post-test last, so content cannot be seen before the pretest.)
- A module is complete when all its required activities are complete.
- A module at or after the student's start module is unlocked when it is the start module,
  the previous module is complete, or the instructor set an override.
- Modules before the start module are `catch_up`: open to work on, but they never block.
"""
from typing import Dict, Iterable, List, Optional, Set, Tuple

COMPLETE = "complete"
IN_PROGRESS = "in_progress"
AVAILABLE = "available"
LOCKED = "locked"
CATCH_UP = "catch_up"

Status = Dict[Tuple[str, str], str]  # (moduleId, activityId) -> "complete" | "in_progress"


def flatten_activities(module: dict) -> List[dict]:
    out = []
    for lesson in module.get("lessons", []):
        for activity in lesson.get("activities", []):
            out.append({**activity, "lessonId": lesson.get("lessonId")})
    return out


def is_required(activity: dict) -> bool:
    return activity.get("required", True) is not False


def activity_states(module: dict, statuses: Status) -> List[dict]:
    """State of each activity in order: complete, in_progress, available, or locked."""
    module_id = module["moduleId"]
    blocked = False
    states = []
    for act in flatten_activities(module):
        recorded = statuses.get((module_id, act["activityId"]))
        if recorded == COMPLETE:
            state = COMPLETE
        elif blocked:
            state = LOCKED
        else:
            state = IN_PROGRESS if recorded == IN_PROGRESS else AVAILABLE
        if is_required(act) and recorded != COMPLETE:
            blocked = True
        states.append({"activityId": act["activityId"], "state": state})
    return states


def module_percent(states: List[dict], module: dict) -> int:
    required = {a["activityId"] for a in flatten_activities(module) if is_required(a)}
    if not required:
        return 0
    done = sum(1 for s in states if s["activityId"] in required and s["state"] == COMPLETE)
    return round(done / len(required) * 100)


def is_module_complete(module: dict, statuses: Status) -> bool:
    required = [a for a in flatten_activities(module) if is_required(a)]
    return bool(required) and all(statuses.get((module["moduleId"], a["activityId"])) == COMPLETE for a in required)


def compute_modules(
    order: List[str],
    modules: Dict[str, dict],
    statuses: Status,
    start_module_id: Optional[str] = None,
    overrides: Iterable[str] = (),
) -> Tuple[List[dict], Optional[dict]]:
    """Return (module views in order, resume pointer or None)."""
    override_set: Set[str] = set(overrides)
    start = order.index(start_module_id) if start_module_id in order else 0
    views: List[dict] = []
    resume = None
    previous_complete = True
    for i, module_id in enumerate(order):
        module = modules[module_id]
        acts = activity_states(module, statuses)
        complete = is_module_complete(module, statuses)
        touched = any(s["state"] in (COMPLETE, IN_PROGRESS) for s in acts)
        if complete:
            state = COMPLETE
        elif i < start:
            state = CATCH_UP
        elif i == start or previous_complete or module_id in override_set:
            state = IN_PROGRESS if touched else AVAILABLE
        else:
            state = LOCKED
        views.append(
            {
                "moduleId": module_id,
                "title": module.get("title"),
                "state": state,
                "percent": module_percent(acts, module),
                "activities": acts,
            }
        )
        if resume is None and i >= start and state in (AVAILABLE, IN_PROGRESS):
            nxt = next((s for s in acts if s["state"] in (AVAILABLE, IN_PROGRESS)), None)
            if nxt:
                resume = {"moduleId": module_id, "activityId": nxt["activityId"]}
        if i >= start:
            previous_complete = complete
    return views, resume


def next_activity(module: dict, statuses: Status) -> Optional[str]:
    """The first open, incomplete activity after the latest change, or None if the module is done."""
    for s in activity_states(module, statuses):
        if s["state"] in (AVAILABLE, IN_PROGRESS):
            return s["activityId"]
    return None
