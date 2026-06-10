# Jobpls

A personal job-application pipeline: **discover → match → approve → tailor → apply**, with a human in the loop at every gate. Runs locally as an always-on **job-alert agent** that emails you new matching jobs. FastAPI + SQLite backend, React + Vite frontend. See [CLAUDE.md](CLAUDE.md) for the full architecture.

## Setup (Linux / macOS)

```bash
# 1. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium   # for the auto-apply browser bot
cd ..

# 2. Frontend
cd frontend && npm install && cd ..

# 3. Run both (backend :8000, frontend :5173)
./start.sh
```

Open http://localhost:5173, sign up, then in **Settings**: add a **Master CV**, fill the **Applicant** profile, and set up **Email** (Gmail SMTP or Resend) to receive alerts.

> **Windows:** use `./start.ps1` instead of `./start.sh`.

## What's not in the repo (you configure it after pulling)

A fresh `backend/jobpls.db` is created on first run — it is **gitignored** because it holds secrets (SMTP app password, API keys). Re-enter those in **Settings** after pulling:
- **Email** → provider + Gmail app password + "Send alerts to" address.
- **Sources** → optional JSearch (RapidAPI) / Adzuna keys to reach Indeed/LinkedIn/Glassdoor.

`backend/.env` is also gitignored; copy `backend/.env.example` and adjust if you want to change the agent cadence (`DISCOVERY_INTERVAL_HOURS`, `DIGEST_INTERVAL_HOURS`).

## Always-on agent

- **Windows:** `install-agent.ps1` registers a login task; `uninstall-agent.ps1` removes it.
- **Linux:** run `./start.sh` under a process manager. A minimal `systemd` user service:

  ```ini
  # ~/.config/systemd/user/jobpls.service
  [Unit]
  Description=Jobpls backend agent
  [Service]
  WorkingDirectory=%h/jobpls/backend
  ExecStart=%h/jobpls/backend/.venv/bin/python -m uvicorn main:app --port 8000
  Restart=always
  [Install]
  WantedBy=default.target
  ```
  Then: `systemctl --user enable --now jobpls` (and `loginctl enable-linger $USER` so it runs without an active login).

## Gotchas

- Launch the backend with `python -m uvicorn main:app --port 8000` (not bare `uvicorn`).
- `DATABASE_URL` and the env file resolve to **absolute** paths from `backend/settings.py`, so the working directory never splits the database.
