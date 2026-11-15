from cic.progress import (AVAILABLE, CATCH_UP, COMPLETE, IN_PROGRESS, LOCKED, activity_states,
                          compute_modules, is_module_complete, next_activity)


def module(mid, n=3):
    acts = [{"activityId": f"{mid}-a{i}", "type": "check"} for i in range(n)]
    return {"moduleId": mid, "title": mid, "lessons": [{"lessonId": "l1", "activities": acts}]}


MODS = {m: module(m) for m in ("m1", "m2", "m3")}
ORDER = ["m1", "m2", "m3"]


def done(mid, upto):
    return {(mid, f"{mid}-a{i}"): COMPLETE for i in range(upto)}


def states(views):
    return {v["moduleId"]: v["state"] for v in views}


def test_activities_open_in_order():
    s = activity_states(MODS["m1"], {("m1", "m1-a0"): COMPLETE, ("m1", "m1-a1"): IN_PROGRESS})
    assert [x["state"] for x in s] == [COMPLETE, IN_PROGRESS, LOCKED]


def test_optional_activities_do_not_block():
    mod = module("m1")
    mod["lessons"][0]["activities"][1]["required"] = False
    s = activity_states(mod, {("m1", "m1-a0"): COMPLETE})
    assert [x["state"] for x in s] == [COMPLETE, AVAILABLE, AVAILABLE]


def test_modules_unlock_in_sequence_and_resume_points_at_first_open_activity():
    views, resume = compute_modules(ORDER, MODS, {**done("m1", 3), **done("m2", 1)})
    assert states(views) == {"m1": COMPLETE, "m2": IN_PROGRESS, "m3": LOCKED}
    assert resume == {"moduleId": "m2", "activityId": "m2-a1"}


def test_fresh_student_starts_at_first_module():
    views, resume = compute_modules(ORDER, MODS, {})
    assert states(views) == {"m1": AVAILABLE, "m2": LOCKED, "m3": LOCKED}
    assert resume == {"moduleId": "m1", "activityId": "m1-a0"}


def test_late_joiner_drops_at_start_module_and_earlier_modules_are_catch_up():
    views, resume = compute_modules(ORDER, MODS, {}, start_module_id="m2")
    assert states(views) == {"m1": CATCH_UP, "m2": AVAILABLE, "m3": LOCKED}
    assert resume == {"moduleId": "m2", "activityId": "m2-a0"}


def test_override_unlocks_a_module():
    views, _ = compute_modules(ORDER, MODS, {}, overrides=["m3"])
    assert states(views)["m3"] == AVAILABLE


def test_everything_done_has_no_resume_pointer():
    statuses = {**done("m1", 3), **done("m2", 3), **done("m3", 3)}
    views, resume = compute_modules(ORDER, MODS, statuses)
    assert all(v["state"] == COMPLETE for v in views) and resume is None
    assert is_module_complete(MODS["m1"], statuses)
    assert next_activity(MODS["m1"], statuses) is None
    assert views[0]["percent"] == 100
