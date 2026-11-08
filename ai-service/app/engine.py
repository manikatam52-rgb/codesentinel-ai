"""AI suggestion engine.

Strategy (free/open-source first, upgradeable):
1. Rule-aware refactor advice derived from each finding's rule id.
2. Static heuristics on the snippet itself (long lines, deep nesting, dupes).
3. If an Ollama (or OpenAI-compatible) endpoint is configured, generate
   natural-language explanations + improved code via a local LLM. Failure
   falls back silently to 1+2 so the API never breaks.
"""
from __future__ import annotations

import os
import re
from collections import Counter

import httpx

_RULE_ADVICE = {
    "SEC-001": ("Remove the hardcoded secret and read it from the environment.", "Use e.g. `process.env.API_KEY` (JS) or `os.environ[\"API_KEY\"]` (Python), and add the secret to your secret manager."),
    "SEC-002": ("Parameterize the SQL query.", "Replace string concatenation with bound parameters or ORM queries to eliminate SQL injection."),
    "SEC-003": ("Remove eval/exec usage.", "Dynamic code execution is a code-injection vector; parse structured input instead."),
    "SEC-004": ("Re-enable TLS verification.", "Set verify=True / rejectUnauthorized:true and configure a proper CA bundle."),
    "SEC-005": ("Upgrade the hash function.", "Use bcrypt/argon2 for passwords or SHA-256 for non-password digests."),
    "SEC-006": ("Use safe deserialization.", "Prefer json; if you must use yaml, call yaml.safe_load."),
    "BUG-002": ("Handle the error explicitly.", "Log the exception with context or rethrow; empty catch blocks hide real failures."),
    "BUG-006": ("Bound the loop.", "Add a max-iteration guard or cancellation check to avoid a hang."),
    "BUG-007": ("Fix the loop bound.", "Use `<` instead of `<=` when the index starts at 0."),
    "QUAL-002": ("Resolve or track the TODO.", "Unfinished markers indicate incomplete work; convert them to tracked issues."),
    "QUAL-003": ("Remove debug output.", "Route diagnostics through a structured logger with levels."),
}

_OLLAMA_URL = os.environ.get("OLLAMA_URL")  # e.g. http://localhost:11434
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "codellama:7b")


def _heuristic_notes(code: str) -> list[str]:
    notes: list[str] = []
    lines = code.splitlines()
    long_lines = [i + 1 for i, ln in enumerate(lines) if len(ln) > 120]
    if long_lines:
        notes.append(f"Lines exceed 120 chars: {long_lines[:5]} — wrap for readability.")
    deep = [i + 1 for i, ln in enumerate(lines) if re.match(r"^(\t| {12,})\S", ln)]
    if deep:
        notes.append("Deep nesting detected; consider early returns or extraction.")
    dupes = [lit for lit, n in Counter(re.findall(r"[\"']([^\"'\n]{6,40})[\"']", code)).items() if n >= 4]
    if dupes:
        notes.append(f"Repeated literals ({', '.join(dupes[:3])}) should be named constants.")
    return notes


def _llm_suggestion(code: str, finding: dict) -> dict | None:
    if not _OLLAMA_URL or not code:
        return None
    prompt = (
        "You are a senior code reviewer. Given this code and a defect report, "
        "produce a concise fix suggestion and improved code.\n\n"
        f"Defect: [{finding.get('ruleId')}] {finding.get('title')}: {finding.get('description')}\n\n"
        f"Code:\n{code[:4000]}"
    )
    try:
        resp = httpx.post(
            f"{_OLLAMA_URL}/api/generate",
            json={"model": _OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=30,
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        if text:
            return {
                "line": finding.get("line", 1),
                "severity": finding.get("severity", "MEDIUM"),
                "suggestion": text[:600],
                "explanation": f"Generated locally by {_OLLAMA_MODEL}.",
            }
    except Exception:
        return None
    return None


def suggest(code: str, language: str, findings: list[dict]) -> list[dict]:
    suggestions: list[dict] = []
    notes = _heuristic_notes(code)

    for f in findings[:30]:
        llm = _llm_suggestion(code, f)
        if llm:
            suggestions.append({**llm, "improvedCode": None})
            continue
        advice, detail = _RULE_ADVICE.get(f["ruleId"], ("Review this finding.", f["description"]))
        suggestions.append(
            {
                "line": f.get("line", 1),
                "severity": f.get("severity", "MEDIUM"),
                "suggestion": advice,
                "improvedCode": None,
                "explanation": f"{detail} (rule {f['ruleId']})",
            }
        )

    for i, note in enumerate(notes[:5]):
        suggestions.append(
            {
                "line": 1,
                "severity": "LOW",
                "suggestion": note,
                "improvedCode": None,
                "explanation": "Static heuristic on the provided snippet.",
            }
        )
    return suggestions
