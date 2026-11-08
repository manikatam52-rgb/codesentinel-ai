import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.engine import suggest  # noqa: E402
from app.severity import classify_severity  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


def test_classify_security_critical():
    assert classify_severity("hardcoded secret api key", "security") == "CRITICAL"


def test_classify_bug_high():
    assert classify_severity("possible race condition", "bug") == "HIGH"


def test_classify_low_default():
    assert classify_severity("minor style issue", "bug") == "LOW"


def test_suggest_rule_advice():
    result = suggest("", "python", [{"ruleId": "SEC-001", "title": "t", "description": "d", "severity": "CRITICAL", "line": 3}])
    assert result[0]["suggestion"]
    assert "SEC-001" in result[0]["explanation"]


def test_suggest_heuristics():
    code = "\n".join(["x = '" + "a" * 200 + "'"] * 2)
    result = suggest(code, "python", [])
    assert result


client = TestClient(app)


def test_api_health():
    assert client.get("/health").json()["status"] == "ok"


def test_api_suggest():
    resp = client.post("/api/suggest", json={"code": "print(1)", "language": "python", "findings": []})
    assert resp.status_code == 200
    assert "suggestions" in resp.json()
