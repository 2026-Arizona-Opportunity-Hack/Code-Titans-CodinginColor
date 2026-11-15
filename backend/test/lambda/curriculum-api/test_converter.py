import io
import json
import zipfile

import boto3
import pytest
from support import api_event

CDN = "https://cdn.example.org"
PDF = f"{CDN}/curriculum/{'c' * 32}.pdf"
PPTX = f"{CDN}/curriculum/{'d' * 32}.pptx"
INS = ("[instructor]", "ins-1")
ADMIN = ("[cic_admin]", "adm-1")
DRAFT = {"title": "Loops in Python", "summary": "Repeat code with for loops.", "concepts": ["loops"],
         "pretest": [{"prompt": "What repeats code?", "choices": ["for", "if", "print", "def"], "correctIndex": 0, "concept": "Loops"}],
         "check": [{"prompt": "range(3) gives?", "choices": ["0,1,2", "1,2,3", "3", "none"], "correctIndex": 0, "concept": "loops"}],
         "worksheet": {"instructions": "Answer in your own words.", "fields": ["Write a loop that prints 1 to 5", "Explain range"]},
         "exit": "What was hardest today?",
         "posttest": [{"prompt": "Which keyword starts a loop?", "choices": ["while", "else", "return", "class"], "correctIndex": 0, "concept": "something else"}]}


@pytest.fixture
def env(api, table, monkeypatch):
    table.put_item(Item={"pk": "USR#ins-1", "sk": "META", "canAuthor": True})  # an instructor with author access
    monkeypatch.setenv("ASSETS_URL", CDN)
    monkeypatch.setenv("ASSETS_BUCKET", "assets")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "curriculum-fn")
    s3 = boto3.client("s3")
    s3.create_bucket(Bucket="assets", CreateBucketConfiguration={"LocationConstraint": "us-west-2"})
    s3.put_object(Bucket="assets", Key=f"curriculum/{'c' * 32}.pdf", Body=b"%PDF-1.4 fake")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("ppt/slides/slide1.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Loops</a:t><a:t>repeat code</a:t></p:sld>')
        z.writestr("ppt/slides/slide2.xml", '<p:sld xmlns:p="p" xmlns:a="a"><a:t>for i in range(3)</a:t></p:sld>')
    s3.put_object(Bucket="assets", Key=f"curriculum/{'d' * 32}.pptx", Body=buf.getvalue())
    import converter
    calls = []

    class FakeLambda:
        def invoke(self, **kw):
            calls.append(json.loads(kw["Payload"]))

    class FakeBedrock:
        def __init__(self):
            self.seen = []

        def converse(self, **kw):
            self.seen.append(kw)
            return {"output": {"message": {"content": [{"toolUse": {"input": DRAFT}}]}}, "usage": {"inputTokens": 1, "outputTokens": 1}}
    fake = FakeBedrock()
    converter._bedrock, converter._lambda, converter._s3 = fake, FakeLambda(), s3
    return api, converter, calls, fake


def call(api, route, body=None, who=INS, path=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path), None)
    return resp["statusCode"], json.loads(resp["body"])


def run(api, calls):
    for c in calls:
        api.lambda_handler(c, None)  # what the background invocation does


@pytest.mark.parametrize("url,kind", [(PDF, "pdf"), (PPTX, "pptx")])
def test_an_instructor_turns_a_file_into_a_draft_module(env, url, kind):
    api, converter, calls, fake = env
    status, body = call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": url})
    assert status == 202 and body["data"]["status"] == "working" and calls == [{"convertJob": body["data"]["jobId"]}]
    run(api, calls)
    status, job = call(api, "GET /v1/curriculum/conversions/{jobId}", path={"jobId": body["data"]["jobId"]})
    assert job["data"]["status"] == "done", job
    mid = job["data"]["moduleId"]
    draft = boto3.resource("dynamodb").Table("content").get_item(Key={"pk": f"MOD#{mid}", "sk": "DRAFT"})["Item"]["module"]
    acts = {a["activityId"]: a for a in draft["lessons"][0]["activities"]}
    assert draft["title"] == "Loops in Python"
    assert [a["type"] for a in draft["lessons"][0]["activities"]] == ["assessment", "slides", "video", "check", "worksheet", "exit", "assessment"]
    assert acts["a-slides"]["document"]["url"] == url and acts["a-slides"]["document"]["kind"] == kind
    assert acts["a-pre"]["questions"][0]["concept"] == acts["a-post"]["questions"][0]["concept"] == "loops"  # gain stays measurable
    assert [f["prompt"] for f in acts["a-ws"]["fields"]] == ["Write a loop that prints 1 to 5", "Explain range"]
    meta = boto3.resource("dynamodb").Table("content").get_item(Key={"pk": f"MOD#{mid}", "sk": "META"})["Item"]
    assert meta["latestVersion"] == 0 and meta["aiDrafted"] is True and meta["createdBy"] == "ins-1"  # unpublished, owned by the author
    sent = fake.seen[0]["messages"][0]["content"]
    if kind == "pdf":
        assert sent[1]["document"]["format"] == "pdf"
    else:
        assert "Slide 1: Loops repeat code" in sent[0]["text"] and "Slide 2: for i in range(3)" in sent[0]["text"]


def test_admins_can_convert_and_others_cannot_read_your_job(env):
    api, _, calls, _ = env
    status, body = call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": PDF}, who=ADMIN)
    assert status == 202
    assert call(api, "GET /v1/curriculum/conversions/{jobId}", who=INS, path={"jobId": body["data"]["jobId"]})[0] == 404
    assert call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": PDF}, who=("[reviewer]", "r1"))[0] == 403
    assert call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": PDF}, who=("[instructor]", "no-author-flag"))[0] == 403


@pytest.mark.parametrize("url", ["https://evil.example.com/x.pdf", f"{CDN}/curriculum/{'c' * 32}.png", None])
def test_only_our_own_uploads_can_be_converted(env, url):
    api, _, _, _ = env
    assert call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": url})[0] == 400


def test_a_model_failure_marks_the_job_failed_with_a_plain_message(env):
    api, converter, calls, fake = env
    fake.converse = lambda **kw: (_ for _ in ()).throw(RuntimeError("model down"))
    _, body = call(api, "POST /v1/curriculum/modules/from-file", {"fileUrl": PDF})
    run(api, calls)
    _, job = call(api, "GET /v1/curriculum/conversions/{jobId}", path={"jobId": body["data"]["jobId"]})
    assert job["data"]["status"] == "failed" and "couldn't draft" in job["data"]["error"]
