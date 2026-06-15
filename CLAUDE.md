# Jobpls — Project Guide (CLAUDE.md)

Jobpls is a job-application pipeline: **discover → match → approve → tailor → apply**, with a human in the loop at every gate. It started as a Google Apps Script + Gemini script and was rebuilt as a FastAPI + React app. It runs locally (SQLite + dev auth + local Ollama) and is deployed to **Render (frontend static) + Render free tier (backend web service) + Supabase (Postgres + Auth)**. The scheduled agent runs as a **GitHub Actions cron** (every 6h, free) so it fires reliably regardless of server sleep. Everything is REST + bearer-JWT so a future mobile client is a drop-in API consumer.

## Repo layout

```
jobpls/
├── backend/            # FastAPI + SQLAlchemy
│   ├── main.py         # app, CORS (env origins), router wiring, lifespan→scheduler
│   ├── settings.py     # pydantic-settings; env config + local defaults. DATABASE_URL + env_file are ABSOLUTE (computed from __file__) so the working dir never splits the DB
│   ├── database.py     # engine from settings.DATABASE_URL (sqlite now, postgres later)
│   ├── models.py       # User, Job, Source, Config, MasterCV, TailoringProfile, Application, ApplicantProfile, ApplyAttempt, SeenJob, InputRequest
│   ├── schemas.py      # Pydantic request/response models
│   ├── auth.py         # bcrypt + JWT issue/verify (pluggable dev|supabase) + get_current_user
│   ├── routers/        # auth, config, sources, jobs, pipeline, cv, tailoring_profiles, requests, applicant, apply, seed
│   ├── services/       # discovery, matching, tailoring, prompts, scheduler, notify, pdf
│   │   ├── ai/         # base.AIProvider, ollama_provider, claude_provider
│   │   ├── apply/      # browser-bot auto-apply: base, browser (Playwright), email_apply, dispatcher
│   │   └── email/      # base.get_sender(config), console_sender, smtp_sender (Gmail), resend_sender
│   ├── requirements.txt # +playwright, +fpdf2, +psycopg2-binary, +alembic
│   ├── alembic.ini     # Alembic config (script_location=migrations/)
│   ├── migrations/     # Alembic migrations: env.py + versions/001_initial_schema.py
│   ├── run_agent.py    # one-shot agent script: discover→assess→expire→digest for all AUTOMATION_ENABLED users
│   ├── Dockerfile      # for optional container deploys
│   ├── .env.example    # copy to .env (gitignored) to override defaults
│   └── jobpls.db       # local SQLite — GITIGNORED (holds secrets: SMTP pw, API keys); delete to reset schema
├── frontend/           # Vite + React 18 + TS + Tailwind
├── start.ps1 / start.sh                # launch backend (8000) + frontend (5173) — Windows / Linux
├── agent.ps1 install-agent.ps1 uninstall-agent.ps1 open-app.ps1   # always-on alert agent (Windows Task at login)
├── render.yaml                         # Render Blueprint: backend (web) + frontend (static)
├── .github/workflows/agent.yml         # GitHub Actions cron (every 6h): runs backend/run_agent.py
├── README.md / .gitignore / .gitattributes
└── CLAUDE.md
```

> **Git:** repo lives at `github.com/spacemunky457/jobpls` (branch `main`). `jobpls.db`, `.env`, `*.bak`, `node_modules` are gitignored — never commit them (secrets live in the DB).

## Running it (IMPORTANT gotchas)

- **Two Python installs on this machine.** `python` is 3.13 and has the backend deps; a separate 3.10 owns the bare `uvicorn` on PATH and does NOT. **Always launch the backend with `python -m uvicorn main:app --port 8000`** — a bare `uvicorn ...` fails with `ModuleNotFoundError: feedparser`. `start.ps1` already does this correctly.
- One-liner: `./start.ps1` (Windows) or `./start.sh` (Linux/macOS) from the repo root → backend on **http://localhost:8000**, frontend on **http://localhost:5173** (Vite dev). API docs at http://localhost:8000/docs.
- Frontend talks to the API via Vite's proxy: `/api/*` → `http://localhost:8000` (see `frontend/vite.config.ts`). The axios client base URL is `import.meta.env.VITE_API_URL || '/api'`.
- **Schema changed?** In dev we use `Base.metadata.create_all` (auto on startup). Adding a **new table** is automatic — no reset. Adding a **column to an existing table** is NOT auto-applied by SQLite create_all → delete `backend/jobpls.db` and restart (or prefer a new table). **Alembic is now set up** (`backend/alembic.ini` + `migrations/`): `migrations/versions/001_initial_schema.py` creates all 12 tables. In production (Postgres), the Render start command and GitHub Actions run `alembic upgrade head` before starting. To add a column in production: write a new migration with `alembic revision -m "describe change"`, implement `upgrade()`/`downgrade()`, then deploy.
- **Absolute paths (hard-won):** `settings.py` computes `DATABASE_URL` and the pydantic `env_file` as ABSOLUTE paths from `__file__`. They used to be relative (`./jobpls.db`, `.env`); when the launch CWD drifted (e.g. `--app-dir` doesn't change CWD) a **second** `jobpls.db` was created elsewhere, silently splitting writes from reads for a whole session. Never reintroduce relative paths here.
- Windows process cleanup: orphaned uvicorn `multiprocessing.spawn` children can keep holding port 8000 after the parent is killed — find them with `Get-CimInstance Win32_Process | ? { $_.Name -match 'python' }` and `Stop-Process`.

## Auth & multi-user

- **Per-user everything.** Every user-owned table has a `user_id` (= JWT `sub`). All routers filter by `current_user.id` via the `get_current_user` dependency (`auth.py`). Unauthed requests → 401/403.
- **Pluggable by `AUTH_MODE`** (`settings.py`):
  - `dev` (current): we issue + verify our own HS256 JWTs signed with `JWT_SECRET`. Signup/login live in `routers/auth.py`. There is **no global password** — users sign up (email + password ≥ 8 chars). A test account exists locally: `test@jobpls.dev` / `password123`.
  - `supabase` (deploy): we only *verify* Supabase-issued JWTs (HS256 secret or JWKS). On first sight of a Supabase identity, `get_current_user` auto-provisions a `User` row and seeds defaults. Frontend would swap its login to the Supabase JS client; the rest of the app is unchanged.
- **Seeding** (`routers/seed.py` → `seed_user`): on signup (or first Supabase login) a user gets default config keys, 11 default job sources, and a default tailoring profile.
- Config is a per-user key/value table (composite PK `user_id,key`); defaults live in `routers/seed.py:DEFAULT_CONFIG`, read via `routers/config.py:get_config_dict(db, user_id)`.

## The pipeline & AI providers

Flow: **discover** (fetch + keyword-filter jobs) → **match** (assess the candidate against the job from their CV: `match` 0–100 + `tier` strong/possible/stretch/skip + eligibility + `verdict`/`strengths`/`gaps`) → user **approves** in the Inbox → **tailor** (CV + cover email) → user reviews/edits → marks **applied**. Match is *candidate-centric* (how well the user's CV fits the role), not a generic job rating; the UI shows the **tier badge**, not the raw number. Assessed jobs get status `assessed`.

- **Discovery** (`services/discovery.py`): always server-side, no AI. 14 fetchers in `FETCHER_MAP`, each `(query, secrets) -> [job dicts]`: remotive, remoteok, greenhouse, lever, ashby, wwr, workingnomads, kariyer, yenibiris, plus **linkedin** (guest endpoint, best-effort/rate-limited), **arbeitnow**, **themuse** (all no-key), and keyed aggregators **jsearch** (RapidAPI → Google-for-Jobs = Indeed/LinkedIn/Glassdoor/ZipRecruiter) + **adzuna**. `run_discovery(sources, keywords, seen_keys, secrets)` threads `secrets` (API keys + `JOB_LOCATION`) from config in `pipeline.discovery_impl`; keyed sources self-skip when their key is empty. Title-keyword filtered; dedup per-user via `SeenJob`. New default sources are added to *existing* users via `POST /sources/seed-defaults` (the "Add recommended" button) — seeding only runs at signup.
  - **Reality:** LinkedIn/Indeed/Glassdoor have no open API; jsearch (keyed) is the reliable, ToS-clean way to reach them. Aggregator/listing sources can't be auto-applied (no form on the page) — only ATS sources (greenhouse/lever/ashby) can.
- **Prompt logic is defined once** in `services/prompts.py` (`build_match_prompt`, `parse_match`, `build_tailor_prompt`, `parse_tailor`, `parse_json_loose`). Both server providers and the browser path reuse it — never duplicate prompt text. Match persistence + tier derivation live in `services/matching.py` (`apply_match`, `match_batch`).
- **AI provider modes** (config key `AI_PROVIDER`):
  - `ollama_browser` (default): the hosted backend can't reach a user's localhost, so the **browser** runs Ollama. Backend exposes *prepare* endpoints that return `{job_id, prompt}` and *ingest* endpoints that accept `{job_id, raw}` and persist. See `routers/pipeline.py` (`/pipeline/assess/batch` + `/assess/results`, `/tailor/batch` + `/tailor/results`) and `frontend/src/ai/ollamaBrowser.ts`. The user must start Ollama allowing the app origin: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.
  - `claude_byok`: server-side `ClaudeProvider` with the user's `CLAUDE_API_KEY`.
  - `claude_managed`: server-side Claude with our `MANAGED_CLAUDE_API_KEY` (billing stub — not enabled yet).
  - `ollama_server`: server-side Ollama (self-host / local backend).
- **Server providers** (`services/ai/`): `AIProvider.chat()` is the only abstract method; `assess_match`/`tailor_cv` delegate to `prompts.py`. `ClaudeProvider` uses the Anthropic SDK (`client.messages.create`, default model `claude-haiku-4-5`, JSON steered via system prompt + loose parse).
- **Master CV + tailoring profiles**: scoring/tailoring use the user's **default** `MasterCV` (`routers/cv.py:get_default_cv_text`) and **default** `TailoringProfile` options (`routers/tailoring_profiles.py`). Tailored CV text is stored in `Application.cv_text` (DB, not local disk — survives ephemeral hosts). `services/tailoring.py:clean_text` normalizes model output (small Ollama models emit literal `\n`). Download via `/jobs/{id}/application/download` → **PDF by default** (`?format=txt` for plain text), rendered by `services/pdf.py:cv_text_to_pdf` (fpdf2, Turkish/smart-char transliteration so core fonts never choke).

## Auto-apply (browser bot — local only)

The app can actually submit applications, but only for ATS sources, and only locally.

- **No keyless ATS API exists** (Greenhouse/Lever/Ashby all need the *company's* secret key), so the only generic mechanism is to **drive the real web form** with Playwright. This is inherently local — a hosted backend can't drive the user's browser and gets IP-blocked. Email-apply is a fallback when a posting lists an address.
- **`services/apply/`**: `base` (Outcome dataclass w/ `trace`, profile/email helpers, PDF resume tempfile), `browser` (Playwright; scans **all iframes**, waits for the form, follows Apply buttons, fills name/email/phone/links, uploads the PDF CV, optionally submits; builds a step-by-step `trace`), `email_apply` (sends via the email sender when a JD has an apply address), `dispatcher` (`run_apply`/`apply_batch`: profile-complete guard, logs every attempt to `ApplyAttempt`, flips `Job.status` to `applied` ONLY on confirmed submit; failures stay `drafted`).
- **`models.ApplicantProfile`** (one per user): real name/email/phone/location/links/work-auth — required before applying. **`models.ApplyAttempt`**: audit log (method/state/detail incl. the trace).
- **Endpoints** (`routers/apply.py`): `POST /apply/{job_id}` (one-click; optional `?headless=false` = "Apply (watch it)", `?autosubmit=false` = fill & pause), `POST /apply/batch`, `GET /apply/{job_id}/attempts`. Profile CRUD in `routers/applicant.py` (`GET/PUT /applicant`).
- **Config**: `APPLY_AUTOSUBMIT`, `APPLY_HEADLESS`. Needs `python -m playwright install chromium`.

## Human-in-the-loop (email + magic links)

- `models.InputRequest` (type `add_info`|`tailor_cv`|`approve`, a secure `token`, status, response). `services/notify.py:create_request` emails a magic link `{APP_BASE_URL}/respond/{token}`.
- **Email is pluggable + per-user** (`services/email/`): `get_sender(config)` builds the sender from the user's config — `console` (dev, logs to backend console), `smtp` (`smtp_sender.py`, e.g. Gmail with an app password — strips spaces from the password), or `resend`. Selected by per-user `EMAIL_PROVIDER`; SMTP creds (`SMTP_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM`) and `RESEND_API_KEY` are per-user config. Verify with `POST /requests/test-email`.
- **Alert recipient**: `notify.recipient_for(user, config)` = `DIGEST_EMAIL` override if set, else the account email (lets a throwaway login email still get alerts at a real inbox). Used by the digest, request emails, and the test email.
- **Public respond endpoints** (`routers/requests.py`): `GET/POST /public/respond/{token}` are token-authed (no login). Answering an `add_info` request stores the text and injects it into that job's tailoring (`services/tailoring.py:get_extra_info`); `approve`/`tailor_cv` flip the job to approved. In-app queue: `GET /requests`.

## Job-alert agent (always-on, local)

The headline feature: the app runs as a personal agent that surfaces fitting jobs and emails them.

- **Scheduler** (`services/scheduler.py`): three ticks looping over users with `SCHEDULER_ENABLED=true` — `_discovery_tick` (`DISCOVERY_INTERVAL_HOURS`, default 6), `_assess_tick` (`SCORING_INTERVAL_MINUTES`; **skips browser-Ollama users** — they assess in the UI), `_digest_tick` (`DIGEST_INTERVAL_HOURS`, default 12 via `.env`). Jobs use **`coalesce=True` + large `misfire_grace_time` + a `next_run_time` ~soon after boot** so a sleeping laptop catches up on wake/boot instead of silently skipping. **`next_run_time` MUST be timezone-AWARE UTC** (`datetime.now(timezone.utc)`) — a naive local time gets read as UTC and pushes the first run hours out.
- **Digest** (`notify.send_digest(db, user, config, since_hours, mark)`): emails matches at/above `DIGEST_MIN_TIER` and eligible; if none assessed (browser-Ollama), falls back to recent new keyword-matched jobs. `mark=True` (the scheduled tick) only includes jobs since the per-user `LAST_DIGEST_AT` marker and advances it → reboots/catch-ups never re-email the same jobs. `mark=False` ("Send digest now") shows current matches without touching the marker. Toggle via `DIGEST_ENABLED`.
- **Always-on (Windows)**: `install-agent.ps1` registers a Scheduled Task that runs `agent.ps1` (the backend) at login (hidden, on-battery, auto-restart). `open-app.ps1` starts the UI on demand. **(Linux)**: `start.sh` + the `systemd` user service in `README.md`.

## Frontend

- **Stack**: Vite + React 18 + TypeScript + Tailwind, TanStack Query for data, axios, react-router-dom v7, lucide-react icons. Light theme.
- **Design tokens** (`tailwind.config.js`): `brand` (sky blue 50–900), `surface`/`surface-muted`, `ink`/`ink-muted`, `line`, shadows `tile`/`tile-hover`. Reusable component classes live in `src/index.css` (`.btn`, `.btn-primary`, `.card`, `.input`, `.label`, `.badge`).
- **Component library** (use these, don't hand-roll): `src/components/ui/` (Card, Button, Input/Textarea/Select, Badge, Alert, EmptyState, Spinner/Skeleton); `src/components/layout/` (`MainFlowShell`, `SettingsShell`, `PageHeader`); `src/components/workflow/` (StatTile, ProgressBanner, PendingInputBanner, PipelineStepper); `src/lib/` (`cn`, `status`).
- **Auth** (`src/auth/`): `AuthContext` stores the JWT in `localStorage` (`jobpls_token`); the axios client (`src/api/client.ts`) attaches it and clears it on 401. `Login.tsx` does signup/login.
- **Routing** (`src/App.tsx`): `/respond/:token` is public; `/settings/*` → `SettingsShell`; everything else → `MainFlowShell`. Both shells gate on auth.
  - **Settings nested-route gotcha**: because the shell mounts at `/settings/*`, the inner `<Routes>` in `SettingsShell.tsx` MUST use **relative** paths (`index` → redirect to `/settings/profile`, `path=":section"` → `SettingsPage`). Absolute inner paths render blank.
- **Pages** (`src/pages/`): Dashboard (stats + run discovery/digest), Inbox = "Review" (filterable job table with **tier badges**, filters, expandable verdict/strengths/gaps, **Approve** button toggle, **Assess match with local Ollama**), Applications = "Prepare" (numbered review→apply panel: edit/save, download PDF, then **Apply now** + **Apply (watch it)** one-click via the browser bot, **Auto-apply all** in the header, **Tailor with local Ollama**), Tracker = "Track" (drafted/applied with expandable **apply history**), Requests = "Needs your input", Settings (centered nav via `layout/SettingsNav`; sections: Profile, **Applicant**, Master CVs, Tailoring, Sources, Filters, AI, Email, Scheduler — Email has SMTP/recipient/digest, Sources has the discovery API-keys card + "Add recommended"), Respond (public). Tier/status/eligibility styling in `src/lib/status.ts`.
- **Browser Ollama** (`src/ai/ollamaBrowser.ts`): `listModels` (connection test), `chat`, `runTasks` (sequential with progress). Model + base URL stored in `localStorage`.

## Environment / settings (backend/.env)

Two layers: **system env** (`backend/.env` / `settings.py`) vs **per-user config** (DB key/value, set in Settings UI, defaults in `routers/seed.py:DEFAULT_CONFIG`).
- **System env** (defaults in `settings.py`): `DATABASE_URL` (absolute sqlite), `AUTH_MODE`, `JWT_SECRET`, `SUPABASE_*`, `ALLOWED_ORIGINS`, `APP_BASE_URL`, `EMAIL_PROVIDER`/`RESEND_API_KEY`/`EMAIL_FROM` (fallbacks), `MANAGED_CLAUDE_API_KEY`, and the agent cadence `DISCOVERY_INTERVAL_HOURS` (6), `SCORING_INTERVAL_MINUTES` (30), `DIGEST_INTERVAL_HOURS` (12).
- **Per-user config** (Settings UI): `AI_PROVIDER`/`OLLAMA_*`/`CLAUDE_*`, `KEYWORDS`/`ELIGIBLE_TYPES`/`BLOCKLIST_COMPANIES`, `PROFILE_BLURB`/`JOB_PREFERENCES`, email (`EMAIL_PROVIDER`, `SMTP_*`, `EMAIL_FROM`, `RESEND_API_KEY`, `DIGEST_EMAIL`, `DIGEST_ENABLED`, `DIGEST_MIN_TIER`, internal `LAST_DIGEST_AT`), apply (`APPLY_AUTOSUBMIT`, `APPLY_HEADLESS`), discovery keys (`JOB_LOCATION`, `JSEARCH_API_KEY`, `ADZUNA_APP_ID/KEY/COUNTRY`), `SCHEDULER_ENABLED`. Per-user config overrides system env where both exist (e.g. email provider).

## Deployment (current architecture)

**Stack in production:**
- **Supabase** — Postgres DB (`DATABASE_URL=postgresql+psycopg://...`) + Auth (JWT verification via `SUPABASE_JWT_SECRET`). Supabase project: `yppmdrarxoajctrnwbga`.
- **Render (free tier)** — backend FastAPI web service (`jobpls-backend.onrender.com`) + frontend static site (`jobpls-frontend.onrender.com`). The backend may sleep on the free tier; the static site never does.
- **GitHub Actions cron** (`.github/workflows/agent.yml`) — runs `backend/run_agent.py` every 6h. This is the **reliable scheduler** regardless of Render sleep. Only secret needed: `DATABASE_URL` (GitHub → Settings → Secrets → Actions). AI + email keys are read from per-user DB config set via the Settings UI.

**How the agent runs per-user:** `run_agent.py` loops all users with `AUTOMATION_ENABLED=true`, creates a `Run` row, calls `services/automation.run_cycle(user_id, run_id)` synchronously → discover → assess (server-side AI only; ollama_browser is skipped) → expire stale jobs → send digest email.

**To use the scheduled agent (cloud setup):**
1. Settings → AI: set `AI_PROVIDER` to `gemini` or `claude_byok` + paste API key (stored in Supabase DB, not in GitHub)
2. Settings → Email: set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (also stored in DB)
3. Settings → Scheduler: enable `AUTOMATION_ENABLED=true`
4. GitHub → Actions → Job Agent → Run workflow (test it manually first)

**Frontend auth in production:** `AuthContext` detects `VITE_SUPABASE_URL` at build time; if set, uses Supabase JS (`supabase.auth.signInWithPassword`) and stores the Supabase access token as `jobpls_token`. Backend verifies it via `SUPABASE_JWT_SECRET`. Local dev still uses the `/auth/signup` + `/auth/login` endpoints.

**Remaining roadmap:** object storage for CV files (Supabase Storage), Stripe tiers (Free=local Ollama, Pro=BYO key, Premium=managed), mobile app (same REST API, drop-in JWT consumer).

## Conventions & gotchas

- New user-owned data → add `user_id`, filter every query by `current_user.id`, and seed defaults in `routers/seed.py` if needed. New default sources/config reach *existing* users only via re-seed (`/sources/seed-defaults`), not automatically.
- Don't put prompt text in TypeScript — the browser path fetches prompts from the backend so logic stays in `services/prompts.py`.
- No local-disk writes for artifacts (Render is ephemeral) — store in the DB.
- **Secrets** (SMTP app password, JSearch/Adzuna/Claude keys) live in per-user **DB config**, never in code or the repo. `jobpls.db`/`.env`/`*.bak` are gitignored — always re-check `git status` before pushing.
- Verify quickly: backend `cd backend && python -c "import main"`; frontend `cd frontend && npm run build` (`tsc && vite build`). For the email/agent path, call `notify.send_digest(...)` or `get_sender(config).send(...)` directly against the DB rather than waiting on the scheduler; the apply bot can be smoke-tested against a local HTTP form (no real submission).
- On a fresh clone (esp. Linux): `pip install -r backend/requirements.txt`, `python -m playwright install chromium`, `npm install` in `frontend/`, then `./start.sh`. The DB starts empty — reconfigure email/keys in Settings.
