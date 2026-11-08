"""Severity classification using weighted keyword heuristics (fast, offline).

Optionally augmented by an LLM if OPENAI_API_KEY / OLLAMA_URL is configured.
"""
from __future__ import annotations

CRITICAL_KEYWORDS = {
    "injection", "rce", "remote code", "hardcoded secret", "credential",
    "private key", "sql injection", "command injection", "auth bypass",
}
HIGH_KEYWORDS = {
    "xss", "csrf", "ssrf", "deserialization", "eval", "exec", "path traversal",
    "race condition", "data loss", "crash", "deadlock", "tls", "unauthenticated",
}
MEDIUM_KEYWORDS = {
    "leak", "swallow", "silent", "off-by-one", "null", "undefined", "timeout",
    "infinite loop", "memory", "unhandled", "promise", "exception",
}


def classify_severity(description: str, category: str = "bug") -> str:
    text = description.lower()
    if category == "security":
        if any(k in text for k in CRITICAL_KEYWORDS):
            return "CRITICAL"
        if any(k in text for k in HIGH_KEYWORDS):
            return "HIGH"
        return "MEDIUM"
    if any(k in text for k in CRITICAL_KEYWORDS):
        return "CRITICAL"
    if any(k in text for k in HIGH_KEYWORDS):
        return "HIGH"
    if any(k in text for k in MEDIUM_KEYWORDS):
        return "MEDIUM"
    return "LOW"
