# 🛡️ CodeSentinel AI

AI-powered code quality and engineering platform: automated pull-request reviews, bug detection with severity classification, security checks, quality scoring, automated test execution, issue tracking and developer analytics.

Full stack: **React + TypeScript** (dashboard) · **Node.js/Express + Prisma + PostgreSQL** (API) · **Python/FastAPI** (AI service) · **GitHub API + Playwright** (automation) · **Docker** (deployment).

---

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │                GitHub / GitHub API          │
                        │   repos · pull requests · webhooks · PRs    │
                        └───────────────▲─────────────▲───────────────┘
                                        │ REST        │ webhook
                                        │ ( PAT )     │ (HMAC-signed)
┌───────────────────┐   HTTPS    ┌──────┴─────────────┴───────┐
│  React Dashboard  │───────────▶│   CodeSentinel API         │
│  (Vite + TS +     │  /api/*    │   Node.js + Express        │
│   Recharts)       │            │                            │
└───────────────────┘            │  modules:                  │
                                 │   auth (JWT, roles)        │
                                 │   projects (RBAC)          │
                                 │   github  (repos/PRs)      │
                                 │   analysis (rule engine,   │
                                 │     scoring, security)     │
                                 │   reviews (auto PR review) │
                                 │   issues · analytics       │
                                 │   testruns (Playwright/    │
                                 │     jest/pytest runner)    │
                                 │   webhooks (sig verify)    │
                                 └───────┬───────────┬────────┘
                                         │ SQL       │ HTTP
                                 ┌───────▼───────┐  ┌▼─────────────────┐
                                 │  PostgreSQL   │  │  AI service      │
                                 │  (Prisma)     │  │  Python + FastAPI│
                                 │ users/orgs/   │  │  · suggestions   │
                                 │ projects/     │  │  · severity      │
                                 │ analyses/     │  │    classifier    │
                                 │ findings/     │  │  (optional local │
                                 │ reviews/...   │  │   LLM via Ollama)│
                                 └───────────────┘  └──────────────────┘
```

### Key flows

1. **Repository analysis** — `POST /api/projects/:id/analyses` fetches the repo tree + files from GitHub, runs the rule engine (18 rules across bugs/security/quality), computes a normalized 0–100 quality score and persists findings with severity.
2. **Automated PR review** — on `pull_request.opened` webhook (or on demand), the API fetches the PR diff, analyzes added lines, stores inline comments and posts a review summary back to GitHub.
3. **AI suggestions** — findings are enriched by the Python AI service; if a local Ollama endpoint is configured, an LLM generates explanations and fixes, otherwise curated rule-aware advice is returned (graceful degradation, never a hard failure).
4. **Test execution** — the test-runner module detects jest/pytest/go test from the cloned repository, executes with a hard timeout, parses results (JSON or regex fallback) and records pass/fail/skip/duration per analysis.
5. **Analytics** — score trend, severity mix, top offending files/rules, issue throughput, and org-wide dashboard overview via SQL aggregations.

---

## Monorepo layout

```
.
├── server/        # Express API (TypeScript) + Prisma schema
│   └── src/modules/{auth,projects,github,analysis,reviews,issues,analytics,testruns,webhooks}
├── web/           # React + TypeScript dashboard (Vite)
├── ai-service/    # Python FastAPI AI microservice
├── e2e/           # Playwright end-to-end tests
└── docker-compose.yml
```

## Quick start (Docker)

```bash
git clone https://github.com/<your-username>/codesentinel-ai.git
cd codesentinel-ai
docker compose up --build
# Web:      http://localhost:80
# API:      http://localhost:4000/api/health
# API docs: http://localhost:4000/api/docs
# AI svc:   http://localhost:8000/health
```

## Local development

Prerequisites: Node 20+, Python 3.12+, PostgreSQL 14+ (or `docker compose up db`).

```bash
# 1. Database
docker compose up -d db

# 2. API
cd server
cp .env.example .env          # then edit JWT_SECRET + ENCRYPTION_KEY
npm install
npx prisma migrate deploy     # or: npx prisma migrate dev --name init
npm run dev                   # http://localhost:4000

# 3. AI service
cd ../ai-service
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 4. Dashboard
cd ../web
npm install
npm run dev                   # http://localhost:5173
```

### Environment variables (server/.env)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Long random string for signing JWTs |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex key — AES-256-GCM encryption of stored GitHub tokens |
| `PORT` | – | API port (default 4000) |
| `CORS_ORIGIN` | – | Allowed web origin (default http://localhost:5173) |
| `AI_SERVICE_URL` | – | Python AI service URL (default http://localhost:8000) |
| `GITHUB_TOKEN` | – | Fallback PAT when a user has none stored |
| `GITHUB_WEBHOOK_SECRET` | – | Required to verify GitHub webhooks in production |
| `OLLAMA_URL` / `OLLAMA_MODEL` | – | (ai-service) local LLM for generated suggestions |

### Connecting your GitHub account

After registering, store a personal access token (repo scope):

```bash
curl -X PUT http://localhost:4000/api/auth/github-token \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"token": "ghp_..."}'
```

Tokens are encrypted at rest (AES-256-GCM) and used to list repos, create projects, run analyses and post PR reviews.

### GitHub webhook (optional, enables auto-review on PR open)

1. In your repo: Settings → Webhooks → Add webhook
2. URL: `https://<your-api-host>/api/webhooks/github` · Content type: `application/json`
3. Secret: value of `GITHUB_WEBHOOK_SECRET` · Events: **Pull requests**

## Security model

- Passwords hashed with bcrypt (cost 12); JWT bearer auth (7-day expiry).
- Organization-scoped RBAC: `OWNER`, `ADMIN`, `DEVELOPER`, `VIEWER` — enforced per project in the service layer.
- All input validated with Zod schemas (422 + field errors on failure).
- GitHub webhook payloads verified with HMAC-SHA256 timing-safe comparison.
- GitHub tokens AES-256-GCM encrypted at rest; logs redact auth headers/secrets.
- Central error handling with consistent `{ error: { code, message, details } }` bodies; pino structured logging.

## Testing

```bash
cd server && npm test          # unit + integration (vitest + supertest)
cd ai-service && pytest tests  # AI service tests
cd e2e && npx playwright test  # end-to-end (needs stack running)
```

CI (GitHub Actions) runs server tests against a real Postgres, builds both frontends, runs the Python tests, and executes Playwright e2e on push.

## API documentation

Interactive Swagger UI is served at **`/api/docs`** (spec at `/api/docs.json`). Highlights:

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/github-token` |
| Projects | `GET/POST /api/projects`, `GET /api/projects/:id` |
| Analysis | `POST/GET /api/projects/:id/analyses`, `GET .../analyses/:analysisId`, `GET /api/analyses/:analysisId/suggestions` |
| PR reviews | `POST/GET /api/projects/:id/reviews` |
| Issues | `POST/GET/PATCH/DELETE /api/projects/:id/issues` |
| Analytics | `GET /api/projects/:id/analytics`, `GET /api/overview` |
| GitHub | `GET /api/github/repos`, `GET /api/projects/:id/pulls` |
| Tests | `GET /api/projects/:id/test-runs` |
| System | `GET /api/health`, `POST /api/webhooks/github` |

## Roadmap ideas

- Inline review comments (line-anchored) via the GitHub Checks API
- Monorepo-aware analysis with per-package scoring
- LLM-based auto-fix PR generation
- Slack/Teams notifications for critical findings

## License

MIT
