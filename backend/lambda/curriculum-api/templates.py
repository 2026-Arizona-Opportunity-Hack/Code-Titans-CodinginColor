"""The standard module template: pretest, video, check, worksheet, exit question, post-test.

Prompts and answers start empty. The author fills them in, and publishing refuses
a module that still has blanks.
"""


def _mcq(question_id: str, **extra) -> dict:
    return {"questionId": question_id, "type": "mcq", "prompt": "", "points": 1,
            "choices": [{"id": "a", "text": ""}, {"id": "b", "text": ""}], **extra}


def standard(module_id: str, title: str) -> dict:
    return {
        "moduleId": module_id,
        "title": title,
        "lessons": [{
            "lessonId": "l1",
            "title": "Lesson 1",
            "activities": [
                {"activityId": "a-pre", "type": "assessment", "role": "pre", "title": "Pretest",
                 "questions": [_mcq("q-pre-1", pairKey="pair-1")]},
                {"activityId": "a-vid", "type": "video", "title": "Watch", "provider": "youtube",
                 "videoId": "", "minSeconds": 0},
                {"activityId": "a-chk", "type": "check", "title": "Check your understanding",
                 "questions": [_mcq("q-chk-1")]},
                {"activityId": "a-ws", "type": "worksheet", "title": "Worksheet", "instructions": "",
                 "fields": [{"fieldId": "f1", "type": "text", "prompt": ""}]},
                {"activityId": "a-exit", "type": "exit", "title": "Exit question",
                 "questions": [_mcq("q-exit-1")]},
                {"activityId": "a-post", "type": "assessment", "role": "post", "title": "Post-test",
                 "questions": [_mcq("q-post-1", pairKey="pair-1")]},
            ],
        }],
    }


TEMPLATES = {"standard": standard}
