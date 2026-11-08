"""CodeSentinel AI service — FastAPI app exposing AI code suggestions."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .engine import suggest
from .severity import classify_severity

app = FastAPI(
    title="CodeSentinel AI Service",
    version="1.0.0",
    description="AI-powered code improvement suggestions and severity classification.",
)


class Finding(BaseModel):
    ruleId: str
    title: str
    description: str
    severity: str
    line: int


class SuggestRequest(BaseModel):
    code: str = ""
    language: str = Field(default="typescript", max_length=40)
    findings: list[Finding] = Field(default_factory=list)


class Suggestion(BaseModel):
    line: int
    severity: str
    suggestion: str
    improvedCode: str | None = None
    explanation: str


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/suggest", response_model=SuggestResponse)
def suggest_endpoint(req: SuggestRequest) -> SuggestResponse:
    if req.language and len(req.language) > 40:
        raise HTTPException(status_code=422, detail="Invalid language")
    suggestions = suggest(req.code, req.language, [f.model_dump() for f in req.findings])
    return SuggestResponse(suggestions=[Suggestion(**s) for s in suggestions])


@app.post("/api/classify-severity")
def classify_endpoint(payload: dict) -> dict:
    """Classify severity for a free-form defect description."""
    description = str(payload.get("description", ""))[:2000]
    category = str(payload.get("category", "bug"))[:40]
    return {"severity": classify_severity(description, category)}
