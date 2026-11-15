import copy
import json

import pytest
from support import api_event

PATH = {"moduleId": "python-loops"}
CDN = "https://cdn.example.org"
PDF = f"{CDN}/curriculum/{'a' * 32}.pdf"
GOOGLE_PUBLISHED = "https://docs.google.com/presentation/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz/embed?start=false&loop=false"
GOOGLE_SHARED = "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/embed"


@pytest.fixture(autouse=True)
def cdn(monkeypatch):
    monkeypatch.setenv("ASSETS_URL", CDN + "/")


def call(api, route, body=None, path=PATH, headers=None):
    auth = {"jwt": {"claims": {"sub": "adm-1", "cognito:groups": "[cic_admin]"}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, headers=headers), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def doc(api):
    created = call(api, "POST /v1/curriculum/modules", {"title": "Python Loops"}, path=None)[1]["data"]
    doc = {k: v for k, v in created.items() if k not in ("revision", "draft")}
    # swap the video step for a slides step
    acts = doc["lessons"][0]["activities"]
    acts[1] = {"activityId": "a-sl", "type": "slides", "title": "Read the deck", "slides": []}
    return doc


def slides(doc):
    return doc["lessons"][0]["activities"][1]


def save(api, doc):
    return call(api, "PUT /v1/curriculum/modules/{moduleId}/draft", doc, headers={"If-Match": "1"})


@pytest.mark.parametrize("document", [
    {"kind": "pdf", "url": PDF, "name": "Loops deck.pdf"},
    {"kind": "google", "url": GOOGLE_PUBLISHED},
    {"kind": "google", "url": GOOGLE_SHARED},
])
def test_a_slides_step_can_show_a_pdf_or_google_slides(api, doc, document):
    slides(doc)["document"] = document
    assert save(api, doc)[0] == 200


@pytest.mark.parametrize("document", [
    {"kind": "pdf", "url": "https://evil.example.com/curriculum/" + "a" * 32 + ".pdf"},   # not our CDN
    {"kind": "pdf", "url": f"{CDN}/curriculum/{'a' * 32}.png"},                          # not a PDF
    {"kind": "pdf", "url": f"{CDN}/other/{'a' * 32}.pdf"},                                # not an upload key
    {"kind": "google", "url": "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/embed"},  # a Doc, not Slides
    {"kind": "google", "url": "https://evil.example.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/embed"},
    {"kind": "google", "url": "javascript:alert(1)"},
    {"kind": "google", "url": GOOGLE_SHARED.replace("/embed", "/edit")},                  # must be the embed form
    {"kind": "video", "url": PDF},
    {"kind": "pdf", "url": PDF, "extra": 1},
    "a string",
])
def test_unsafe_or_unknown_documents_are_refused(api, doc, document):
    slides(doc)["document"] = document
    status, body = save(api, doc)
    assert status == 400 and any("document" in p["path"] for p in body["details"])


def test_a_document_counts_as_content_for_publishing(api, doc):
    from moduledoc import publish_problems
    with_doc = copy.deepcopy(doc)
    slides(with_doc)["document"] = {"kind": "pdf", "url": PDF}
    assert not any("slides" in p["path"] for p in publish_problems(with_doc))
    assert any(p["path"].endswith("activities[1].slides") for p in publish_problems(doc))


def test_a_worksheet_can_show_the_original_worksheet(api, doc):
    ws = next(a for a in doc["lessons"][0]["activities"] if a["type"] == "worksheet")
    ws["document"] = {"kind": "pdf", "url": PDF, "name": "Loops worksheet.pdf"}
    assert save(api, doc)[0] == 200
    ws["document"] = {"kind": "pdf", "url": "https://evil.example.com/x.pdf"}
    status, body = save(api, doc)
    assert status == 400 and any("document" in p["path"] for p in body["details"])


PPTX_URL = f"{CDN}/curriculum/{'b' * 32}.pptx"


def test_a_slides_step_can_show_an_uploaded_powerpoint(api, doc):
    slides(doc)["document"] = {"kind": "pptx", "url": PPTX_URL, "name": "Loops.pptx"}
    assert save(api, doc)[0] == 200
    slides(doc)["document"] = {"kind": "pptx", "url": PDF}  # a PDF key under the pptx kind
    assert save(api, doc)[0] == 400
    slides(doc)["document"] = {"kind": "pptx", "url": "https://evil.example.com/curriculum/" + "b" * 32 + ".pptx"}
    assert save(api, doc)[0] == 400
