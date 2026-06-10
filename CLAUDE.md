# Jobpls — Project Guide (CLAUDE.md)

Jobpls is a job-application pipeline: **discover → match → approve → tailor → apply**, with a human in the loop at every gate. It started as a Google Apps Script + Gemini script and was rebuilt as a FastAPI + React app. It runs locally now (SQLite + dev auth + local Ollama in the browser) and is being built so it can deploy to **Render (backend) + Supabase (Postgres + Auth)** later, and become a native mobile app after that. Everything is REST + bearer-JWT so a future mobile client is a drop-in API consumer.

## Repo layout

```
jobpls/
├── backend/            # FastAPI + SQLAlchemy
│   ├── main.py         # app, CORS (env origins), router wiring, lifespan→scheduler
│   ├── settings.py     # pydantic-settings; ALL env config + local-friendly defaults
│   ├── database.py     # engine from settings.DATABASE_URL (sqlite now, postgres later)
│   ├── models.py       # User, Job, Source, Config, MasterCV, TailoringProfile, Application, SeenJob, InputRequest
│   ├── schemas.py      # Pydantic request/response models
│   ├── auth.py         # bcrypt + JWT issue/verify (pluggable dev|supabase) + get_current_user
│   ├── routers/        # auth, config, sources, jobs, pipeline, cv, tailoring_profiles, requests, seed
│   ├── services/       # discovery, matching, tailoring, prompts, scheduler, notify
│   │   ├── ai/         # base.AIProvider, ollama_provider, claude_provider
│   │   └── email/      # base.get_sender, console_sender (dev), resend_sender (prod)
│   ├── requirements.txt
│   ├── .env.example    # copy to .env to override defaults
│   └── jobpls.db       # local SQLite (gitignore-able; delete to reset schema)
├── frontend/           # Vite + React 18 + TS + Tailwind
├── start.ps1           # launches backend (8000) + frontend (5173)
└── CLAUDE.md
```

## Running it (IMPORTANT gotchas)

- **Two Python installs on this machine.** `python` is 3.13 and has the backend deps; a separate 3.10 owns the bare `uvicorn` on PATH and does NOT. **Always launch the backend with `python -m uvicorn main:app --port 8000`** — a bare `uvicorn ...` fails with `ModuleNotFoundError: feedparser`. `start.ps1` already does this correctly.
- One-liner: `./start.ps1` from the repo root → backend on **http://localhost:8000**, frontend on **http://localhost:5173** (Vite dev). API docs at http://localhost:8000/docs.
- Frontend talks to the API via Vite's proxy: `/api/*` → `http://localhost:8000` (see `frontend/vite.config.ts`). The axios client base URL is `import.meta.env.VITE_API_URL || '/api'`.
- **Schema changed?** In dev we use `Base.metadata.create_all` (no migrations yet). After model changes, delete `backend/jobpls.db` and restart to rebuild. (Alembic is deferred to the deploy pass.)
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

- **Discovery** (`services/discovery.py`): always server-side, no AI. Fetchers: remotive, remoteok, greenhouse, lever, ashby, We Work Remotely (wwr), Working Nomads, plus Turkey sources kariyer & yenibiris. Dedup per-user via `SeenJob`.
- **Prompt logic is defined once** in `services/prompts.py` (`build_match_prompt`, `parse_match`, `build_tailor_prompt`, `parse_tailor`, `parse_json_loose`). Both server providers and the browser path reuse it — never duplicate prompt text. Match persistence + tier derivation live in `services/matching.py` (`apply_match`, `match_batch`).
- **AI provider modes** (config key `AI_PROVIDER`):
  - `ollama_browser` (default): the hosted backend can't reach a user's localhost, so the **browser** runs Ollama. Backend exposes *prepare* endpoints that return `{job_id, prompt}` and *ingest* endpoints that accept `{job_id, raw}` and persist. See `routers/pipeline.py` (`/pipeline/assess/batch` + `/assess/results`, `/tailor/batch` + `/tailor/results`) and `frontend/src/ai/ollamaBrowser.ts`. The user must start Ollama allowing the app origin: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.
  - `claude_byok`: server-side `ClaudeProvider` with the user's `CLAUDE_API_KEY`.
  - `claude_managed`: server-side Claude with our `MANAGED_CLAUDE_API_KEY` (billing stub — not enabled yet).
  - `ollama_server`: server-side Ollama (self-host / local backend).
- **Server providers** (`services/ai/`): `AIProvider.chat()` is the only abstract method; `assess_match`/`tailor_cv` delegate to `prompts.py`. `ClaudeProvider` uses the Anthropic SDK (`client.messages.create`, default model `claude-haiku-4-5`, JSON steered via system prompt + loose parse).
- **Master CV + tailoring profiles**: scoring/tailoring use the user's **default** `MasterCV` (`routers/cv.py:get_default_cv_text`) and **default** `TailoringProfile` options (`routers/tailoring_profiles.py`). Tailored CV text is stored in `Application.cv_text` (DB, not local disk — survives ephemeral hosts); downloadable via `/jobs/{id}/application/download`.

## Human-in-the-loop (email + magic links)

- `models.InputRequest` (type `add_info`|`tailor_cv`|`approve`, a secure `token`, status, response). `services/notify.py:create_request` emails a magic link `{APP_BASE_URL}/respond/{token}` and `send_digest` builds the daily digest.
- **Email is pluggable** (`services/email/`): `console_sender` (dev — logs the email + link to the backend console so you can test without Resend) and `resend_sender` (prod). Selected by `EMAIL_PROVIDER` (`console`|`resend`).
- **Public respond endpoints** (`routers/requests.py`): `GET/POST /public/respond/{token}` are token-authed (no login) so the link works from any device. Answering an `add_info` request stores the text and injects it into that job's tailoring (`services/tailoring.py:get_extra_info`); `approve`/`tailor_cv` flip the job to approved. The in-app "Needs your input" queue is `GET /requests` (authed).
- **Scheduler** (`services/scheduler.py`): one discovery tick + one scoring tick at a system-wide cadence (from `settings`), looping over all users that have `SCHEDULER_ENABLED=true`. Browser-Ollama users are skipped for server scoring (they score from the UI).

## Frontend

- **Stack**: Vite + React 18 + TypeScript + Tailwind, TanStack Query for data, axios, react-router-dom v7, lucide-react icons. Light theme.
- **Design tokens** (`tailwind.config.js`): `brand` (sky blue 50–950), `surface`/`surface-muted`, `ink`/`ink-muted`, `line`, layered shadows `tile`/`tile-hover`/`pop`/`rail` (tiles on a **white** canvas), Inter font, `fade-up`/`fade-in`/`slide-in` animations. Reusable component classes live in `src/index.css` (`.btn`, `.btn-primary`, `.btn-ghost`, `.card`, `.input`, `.label`, `.badge`, and `.tile`/`.tile-interactive` — the compact vertical tile used across Review/Track/stats).
- **Component library** (use these, don't hand-roll): `src/components/ui/` (Card, Button, Input/Textarea/Select, Badge, Alert, EmptyState, Spinner/Skeleton, **Drawer** — right slide-over for detail views); `src/components/layout/` (`MainFlowShell`, `SettingsShell`, `PageHeader`); `src/components/workflow/` (StatTile, ProgressBanner, PendingInputBanner, PipelineStepper); `src/components/ErrorBoundary.tsx` (wraps the app in `main.tsx`); `src/lib/` (`cn`, `status`).
- **Auth** (`src/auth/`): `AuthContext` stores the JWT in `localStorage` (`jobpls_token`); the axios client (`src/api/client.ts`) attaches it and clears it on 401. `Login.tsx` does signup/login.
- **Routing** (`src/App.tsx`): `/respond/:token` is public; `/settings/*` → `SettingsShell`; everything else → `MainFlowShell`. Both shells gate on auth.
  - **Settings nested-route gotcha**: because the shell mounts at `/settings/*`, the inner `<Routes>` in `SettingsShell.tsx` MUST use **relative** paths (`index` → redirect to `/settings/profile`, `path=":section"` → `SettingsPage`). Absolute inner paths render blank.
- **Pages** (`src/pages/`): Dashboard (accented stat tiles + run discovery/digest + suggested next step), Inbox = "Review" (compact vertical **job-tile grid** with tier badges; jobs are fetched once and filtered **client-side** for instant search/tier/eligibility/status chips + best-match sort; tile click opens a **Drawer** with verdict/strengths/gaps/JD; **optimistic** approve toggle, "Approve all strong" bulk action via `PATCH /jobs/batch/approve`, **Assess match with local Ollama** orchestration), Applications = "Prepare" (tile picker + review/edit tailored CV+email, download, apply, **Tailor with local Ollama**), Tracker = "Track" (tile grid + Drawer for draft/apply history), Requests = "Needs your input", Settings (centered segmented nav via `layout/SettingsNav`; sections: Profile, Master CVs, Tailoring, Sources, Filters, AI, Email, Scheduler), Respond (public). Tier/status/eligibility styling lives in `src/lib/status.ts` (`TIER_META`/`tierMeta`, `STATUS_CLASS`, `ELIGIBILITY_CLASS`).
- **Browser Ollama** (`src/ai/ollamaBrowser.ts`): `listModels` (connection test), `chat`, `runTasks` (sequential with progress). Model + base URL stored in `localStorage`.

## Environment / settings (backend/.env)

Key vars (all have local defaults in `settings.py`): `DATABASE_URL`, `AUTH_MODE`, `JWT_SECRET`, `SUPABASE_JWT_SECRET`/`SUPABASE_JWKS_URL`, `ALLOWED_ORIGINS`, `APP_BASE_URL`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `MANAGED_CLAUDE_API_KEY`, `DISCOVERY_INTERVAL_HOURS`, `SCORING_INTERVAL_MINUTES`. See `backend/.env.example`.

## Deployment roadmap (later)

Flip env vars, no app-code changes for the data layer: `DATABASE_URL` → Supabase Postgres, `AUTH_MODE=supabase` (+ JWKS/secret), `ALLOWED_ORIGINS`/`APP_BASE_URL` → Render URLs, `EMAIL_PROVIDER=resend`. Remaining work for deploy: add Alembic migrations, swap the frontend login to Supabase JS, object storage for CV files (Supabase Storage), and Stripe tiers (Free=local Ollama, Pro=BYO Claude key, Premium=managed Claude). Mobile app reuses the same REST API.

## Conventions & gotchas

- New user-owned data → add `user_id`, filter every query by `current_user.id`, and seed defaults in `routers/seed.py` if needed.
- Don't put prompt text in TypeScript — the browser path fetches prompts from the backend so logic stays in `services/prompts.py`.
- No local-disk writes for artifacts (Render is ephemeral) — store in the DB.
- Verify quickly: backend `cd backend && python -c "import main"`; frontend `cd frontend && npm run build` (runs `tsc && vite build`).
