# Jobpls v2 — "Tiles" Redesign Spec (rev 2)

Three ideas drive the redesign:

1. **Setup is a product, not a settings page.** Step-by-step tile wizard (You → CV → Engine →
   Sources → Automation). Settings later *is* the same wizard, re-entered at any step.
2. **The app always knows your next move.** Home computes the single next *human* action;
   each stage is a focused, one-decision flow.
3. **Machine work is automated; human work is curated.** With a server-side AI provider
   (Google Gemini free API being the headline option), one **Run Automation** switch makes the
   app discover, assess, re-evaluate, and email a digest on the user's schedule.

**Keep:** FastAPI backend, REST+JWT contract, prompts in `services/prompts.py`, `ui/` primitives,
token system. **Rewrite:** the page layer, shells, routing. **Add:** `GeminiProvider`,
automation engine, setup/automation endpoints.

## Design language: the floating canvas

The app is **not full-screen**. Everything lives in one large centered canvas tile floating on a
quiet backdrop, with visible space above and below:

- **Canvas:** centered, `max-w-7xl`, vertical margin `my-4 sm:my-6`, `rounded-3xl bg-white
  shadow-pop ring-1 ring-ink/5`. Content scrolls *inside* the canvas; the backdrop never moves.
  Header and pipeline nav live inside it.
- **Backdrop:** `bg-surface-muted` with a soft radial brand wash — behind every route including
  login and the wizard.
- **Shadow hierarchy:** backdrop (none) → canvas (`shadow-pop`) → tiles (`shadow-tile`, hover
  `tile-hover`) → drawers/modals (`shadow-pop` + scrim). Nothing else uses `pop`; nothing inside
  a tile gets its own shadow (use `ring`/`bg-surface-muted` insets).
- **Mobile (<640px):** margins and radius collapse — full-bleed.

## Information architecture — 4 surfaces

| Route     | Name   | Job |
|-----------|--------|-----|
| `/`       | Home   | Next-action hero, automation tile, stage rail, needs-input tiles |
| `/review` | Review | One-at-a-time match deck (grid as secondary view) |
| `/apply`  | Apply  | Kit workflow; tabs *In progress* / *Sent* (absorbs Tracker) |
| `/setup`  | Setup  | Re-enterable wizard (replaces Settings; Requests fold into Home) |

## Setup wizard

One step at a time, resumable via `GET /setup/state`. Board view shows all steps as tiles with
completion checks; the app is usable once CV + engine are complete.

1. **You** — profile blurb + preferences (+ applicant details for auto-apply, collapsed).
2. **Your CV** — paste or PDF upload, default CV, tailoring style.
3. **Matching engine** — four choice-tiles, 2×2: **Google Gemini (free, Recommended — enables
   automation)**, Local Ollama (private; guided OLLAMA_ORIGINS connect + test), My Claude key,
   Managed (soon, locked). Gemini tile: link to aistudio.google.com, paste field, **Test key**,
   model default `gemini-2.5-flash`; honest free-tier rate-limit note.
4. **Where to look** — source toggle tiles, keyword chips, eligibility, blocklist, optional
   aggregator keys.
5. **Automation** — master switch + frequency (2h/6h/12h/daily) + digest mode (*after each run
   if new* / *daily at HH:MM*) + min tier + email delivery (console/SMTP/Resend) + test email.

## Home

- **Hero tile** = next *human* action only (answer input → review matches → tailor → send).
- **Automation tile** owns all machine work: states *Not ready* (checklist: server engine /
  email / CV, each linking to its wizard step) → *Off* (manual Run now + enable switch) →
  *Armed* (countdown, frequency, Run now, pause) → *Running* (live phase + counts via polling).
- Stage rail: Found / Matched / Shortlisted / Ready / Sent stat tiles, deep-linking.
- Pending input requests render inline as amber tiles (Requests page deleted).

## Automation

One cycle = **discover → assess → expire → digest**:
1. Discover via existing fetchers + dedup.
2. Assess all `new` jobs server-side (Gemini/Claude/server-Ollama), throttled to provider rate
   limits with 429 backoff. Browser-Ollama users: phase skipped (UI nudges to Gemini).
3. Postings older than `JOB_EXPIRY_DAYS` (default 21) auto-`passed`.
4. Digest via `notify.send_digest` with approve magic links; never sent empty; modes
   `after_run` / `daily@HH:MM`.

Scheduling: master tick every 15 min checks each user's last auto-run vs their
`AUTOMATION_INTERVAL_HOURS`. Runs persist in a `runs` table (phase/found/assessed/errors) and
are pollable via `GET /automation/runs/{id}`. Locally, cycles run while the backend is up;
after the Render deploy this becomes 24/7 with zero design changes.

## Matching & tailoring quality

1. Model upgrade: `gemini-2.5-flash` (or Claude) vs llama3.2-3B — generational jump.
2. Structured output: Gemini JSON mode (`responseMimeType: application/json`); Claude
   system-steered; `parse_json_loose` stays as Ollama fallback.
3. Prompt v2 (shared in `services/prompts.py`): tier calibration rubric, CV-evidence-backed
   strengths, explicit eligibility rules; ATS-safe tailoring constraints.
4. Re-evaluation keeps scores aligned with the latest CV (future: compare assessed_at vs CV
   updated_at).

## Status model

UI stages: `new→Found`, `assessed→Matched`, `approved→Shortlisted`, `drafted→Ready`,
`applied→Sent`, plus `passed` (manual pass + auto-expiry). Mapping lives in
`src/lib/status.ts`; DB enum rename deferred to the Alembic pass.

## Backend additions

| Addition | Purpose |
|---|---|
| `services/ai/gemini_provider.py` | REST `generateContent`, built-in rate limiter + 429 backoff, JSON mode |
| Config keys | `GEMINI_API_KEY`, `GEMINI_MODEL`, `AUTOMATION_ENABLED`, `AUTOMATION_INTERVAL_HOURS`, `DIGEST_MODE`, `DIGEST_TIME`, `JOB_EXPIRY_DAYS` |
| `GET /setup/state`, `POST /setup/test-ai` | Wizard resume/nudges + key tests |
| `GET/PUT /automation`, `POST /automation/run-now`, `GET /automation/runs/{id}` | Tile state, settings, manual trigger, pollable progress |
| `models.Run` | Persisted run progress (kind/phase/found/assessed/expired/digest_sent/error) |
| Scheduler rework | One 15-min master tick + per-user due check; replaces system-wide cadence |

Constraints: every endpoint filters by `current_user.id`; prompts never move to TypeScript;
artifacts stay in the DB; API keys live in the per-user config table.

## Build phases

1. **Canvas + Setup** — floating-canvas shell, wizard, `setup/state`, GeminiProvider + key
   test, delete Settings shell.
2. **Home + Automation** — hero engine, automation tile, per-user scheduler, runs endpoint,
   digest settings, prompt v2, delete Dashboard/Requests.
3. **Review deck** — deck UI, keyboard, `passed`/expiry, grid demoted to secondary.
4. **Apply kit** — tabbed Apply, kit mini-stepper, merge Tracker, route renames + redirects.

## Risks / notes

- Gemini free-tier limits change; the provider throttle reads RPM from code defaults — verify
  current numbers when they bite.
- Local automation depends on the laptop staying awake; the tile shows "last run" so silent
  stalls are visible.
- Keys stored in per-user config like `CLAUDE_API_KEY` today; encryption-at-rest at deploy pass.
