import json

from cic.log import log


def test_log_redacts_pii_fields_even_when_nested(capsys):
    log("login", classId="c1", displayName="Ana R.", nested={"studentCode": "maple-tiger-blue", "ok": 1})
    out = json.loads(capsys.readouterr().out)
    assert out["classId"] == "c1"
    assert out["displayName"] == "[redacted]"
    assert out["nested"] == {"studentCode": "[redacted]", "ok": 1}
