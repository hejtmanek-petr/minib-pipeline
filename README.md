# MINIB Project Pipeline

A sales pipeline management web application for MINIB a.s. (manufacturer of heating and cooling convectors). It replaces the manual `open projects-MEA-2026-04-08.xlsx` tracker with a shared database, project detail pages, a comment pipeline (including AI-corrected voice notes), AI-assisted win-probability assessment, and reporting/analytics dashboards for the TR and CIS regions.

## Requirements

- Node.js 18+
- npm

## Installation

```bash
git clone <repo-url> && cd minib-pipeline
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and JWT_SECRET in .env
npm install
node database/seed.js   # Populates the database from the Excel file
npm start
# Open http://localhost:3000
```

## Test accounts (created by seed.js)

| Email | Password | Role | Countries |
|---|---|---|---|
| admin@minib.cz | Admin123! | HQ | all |
| hakan@minib.cz | Dealer123! | DEALER | TR, AZ |
| cem@minib.cz | Dealer123! | DEALER | GE, Mong, AZ |
| sefa@minib.cz | Dealer123! | DEALER | TR |
| ogun@minib.cz | Dealer123! | DEALER | TR |

## Configuration (`.env`)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key used for transcript correction and AI win-probability assessment. If unset, AI features degrade gracefully (the rest of the app keeps working). |
| `JWT_SECRET` | Secret used to sign session JWTs. Change this in production. |
| `PORT` | Port the Express server listens on (default `3000`). |
| `DB_PATH` | Path to the SQLite database file (default `./data/pipeline.db`). |
| `NODE_ENV` | `development` or `production`. Affects cookie `secure` flag and CORS defaults. |
| `ALLOWED_ORIGINS` | Comma-separated list of origins allowed by CORS in production. |

## Voice input

The comment pipeline supports voice notes via the browser's native **Web Speech API**. This only works:

- Over **HTTPS**, or on **localhost** (browser security restriction)
- In **Chrome** or **Edge** (Safari/Firefox support is limited or absent)

If unsupported, the UI shows a fallback message and the text comment box remains fully usable.

## Deployment

For a quick remote deployment so international colleagues can access the app:

- **Railway.app** or **Render** — connect the repo, set the environment variables from `.env.example`, and deploy. Both support persistent disks for the SQLite file.
- **VPS** — run with [PM2](https://pm2.keymetrics.io/) (`pm2 start server.js --name minib-pipeline`), put **nginx** in front as a reverse proxy, and use **certbot** for a free HTTPS certificate (required for voice input on a real domain).

## Project structure

```
minib-pipeline/
├── server.js            Express entry point
├── database/            schema.sql + seed.js (Excel import)
├── src/
│   ├── routes/           auth, projects, comments, reports, admin, ai
│   ├── middleware/        JWT auth + HQ/DEALER permissions
│   └── services/ai.js     Anthropic API integration
├── public/                static frontend (vanilla JS/HTML/CSS)
└── locales/                cs.json / en.json translations
```

See [ROADMAP.md](ROADMAP.md) for planned future enhancements.
