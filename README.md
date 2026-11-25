# TitanBot MBVN

**TitanBot MBVN** is a modular, production-ready Discord community, Upland FAQ assistant, moderation, economy, and utility bot built with **Discord.js v14**, **Express 5**, **Gemini 2.5 Flash RAG**, **Lavalink v4 (Riffy)**, and **PostgreSQL 17 (Railway / Supabase)**.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.10.0-339933?logo=node.js&logoColor=white&style=flat-square)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.26-5865F2?logo=discord&logoColor=white&style=flat-square)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%20(Railway%20%2F%20Supabase)-336791?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Feature Modules (100 Slash Commands)](#feature-modules-100-slash-commands)
3. [Upland FAQ RAG Assistant & Self-Healing Knowledge Base (`/ask`)](#upland-faq-rag-assistant--self-healing-knowledge-base-ask)
4. [Project Structure](#project-structure)
5. [Step-by-Step Deployment Guide](#step-by-step-deployment-guide)
   - [Step 1: Discord Developer Portal Setup](#step-1-discord-developer-portal-setup)
   - [Option A: Deploy on Railway (Recommended)](#option-a-deploy-on-railway-recommended)
   - [Option B: Deploy on Render + Supabase](#option-b-deploy-on-render--supabase)
   - [Option C: Docker & Docker Compose (Self-Hosted / VPS)](#option-c-docker--docker-compose-self-hosted--vps)
   - [Option D: Local Node.js Development](#option-d-local-nodejs-development)
6. [First-Time Discord Server Setup](#first-time-discord-server-setup)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Database Schema, Migrations, Backups & Testing](#database-schema-migrations-backups--testing)
9. [Version Control & Instant Rollback](#version-control--instant-rollback)

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Discord["Discord Platform"]
        GW["Discord Gateway<br/>(WebSocket Intents)"]
        REST["Discord REST API v10<br/>(100 Global Slash Commands)"]
    end

    subgraph Runtime["TitanBot MBVN (Node 20 Alpine / Non-Root)"]
        APP["src/app.js<br/>Client + Cron Scheduler"]
        FAQ["uplandFaqService.js<br/>BM25 RAG + Gemini 2.5 Flash"]
        HTTP["Express Server (:3000)<br/>GET /health & /ready"]
        KEEP["13.5-Min Keep-Alive<br/>(810,000 ms Timer)"]
        DBW["DatabaseWrapper<br/>(PostgreSQL -> Memory Fallback)"]
    end

    subgraph Infra["Managed Cloud Infrastructure"]
        PG[("PostgreSQL 17 (Railway / Supabase)<br/>19 Structured Tables<br/>(Auto-Migrated & Indexed)")]
        GEMINI["Google Gemini API<br/>(gemini-3.8-flash)"]
        LAVA["Lavalink v4 SSL Nodes<br/>(lavalink/nodes.json)"]
    end

    GW <--> APP
    APP --> REST
    APP --> FAQ
    FAQ <-->|"Prompt-Isolated RAG"| GEMINI
    APP --> HTTP
    KEEP -->|"HTTPS GET /health"| HTTP
    APP --> DBW
    FAQ <--> DBW
    DBW <-->|"TLS Pool"| PG
    APP <-->|"Riffy v4"| LAVA
```

- **Multi-Guild Isolation**: Every server's configuration, Upland FAQ database, economy, leveling, tickets, and moderation records are strictly scoped by `guild_id`.
- **Self-Healing Upland FAQ Engine**: Combines precomputed BM25 retrieval over official Upland documentation (`src/data/upland/`) with a per-server PostgreSQL Community FAQ Database (`upland_faq_entries` & `upland_faq_contributors`), complete with `#bot-logs` approval workflows and automatic **Veteran** role progression.
- **Graceful Degradation**: If PostgreSQL is temporarily unreachable, `DatabaseWrapper` falls back to in-memory storage and surfaces degraded status on `GET /ready` (`HTTP 503`).
- **Hardened Runtime**: Includes prompt-injection XML boundary isolation, RBAC verified-entry protection, bounded TTL/LRU memory caches, proxy-aware Express rate limiting, and non-root Docker execution.

---

## Feature Modules (100 Slash Commands)

| Category | Key Capabilities |
| :--- | :--- |
| **Upland FAQ & Community (`/ask`)** | Grounded Upland Q&A (`/ask`, `!ask`, `@TitanBot`), passive self-healing chat learning, **`💡 Teach / Submit Answer`** modals, `#bot-logs` **Approve / Disapprove** review cards, and automatic **Veteran** role unlock at 25 approved answers. |
| **Verification (Upland IGN Modal)** | Interactive verification button panel (`/verification setup`) that opens an in-game **Upland Username & Home City** modal, assigns the verified role, and logs the linked IGN to `#bot-logs`. |
| **Moderation & Logging** | Ban, kick, timeout, warn, mass actions, user notes, case management, mention-safe `/say`, and configurable audit log dashboards (`/logging`). |
| **Support Tickets** | Interactive ticket panels, staff claiming, priority levels (`low` to `urgent`), per-user open limits, transcripts, and archiving. |
| **Economy & Shop** | Per-server balances, bank storage, daily rewards, work/beg/crime/rob commands, customizable shop items, and leaderboards. |
| **Leveling & XP** | Message XP tracking with cooldowns, level-up announcements, milestone role rewards, and server rank leaderboards. |
| **Applications (`/apply`)** | Multi-question application modals, staff review buttons (Approve/Deny), role assignment, and automatic retention cleanup. |
| **Giveaways & Birthdays** | Multi-winner giveaways with automatic cron completion/rerolls, plus timezone-aware daily birthday announcements. |
| **Voice & Music** | Dynamic Join-to-Create temporary voice channels and 24/7 Lavalink v4 music playback (`/play`, `/music`, `/queue`, `/nowplaying`). |
| **Server Stats & Roles** | Auto-updating member/bot/human voice counter channels (every 15 min) and interactive Reaction Role panels. |

> See [`COMMANDS.md`](COMMANDS.md) for the complete reference of all 100 slash commands across 18 categories.

---

## Upland FAQ RAG Assistant & Self-Healing Knowledge Base (`/ask`)

1. **Multi-Trigger Q&A**:
   - **Slash Command**: `/ask question: What is UPX used for?`
   - **Prefix Command**: `!ask what's an FSA property?` (or `!upland`, `!faq`)
   - **Direct Mention**: `@TitanBot How does Sparklet staking work?`
   - **Passive Zero-Command Auto-Answer**: Detects natural Upland questions in chat and replies automatically (with per-user cooldowns).
2. **Teach & Self-Healing Learning**:
   - Every `/ask` response includes **`💡 Teach / Submit Answer`** and **`📚 Community Answers DB`** buttons.
   - When a question isn't in the official docs yet and another player replies to it in chat (or submits via the Teach button / `/ask teach_answer:`), TitanBot distills the answer and posts a review card to **`#bot-logs`** (or your configured Audit log channel).
3. **Veteran Role & Moderation Workflow**:
   - **Pending Review**: Community-submitted answers start as `pending` and are only served by `/ask` after a **Veteran**, **Moderator**, or **Admin** clicks **`✅ Approve`** in `#bot-logs`.
   - **Protected Verified Entries**: Verified Staff/Veteran entries (`verified = true`) cannot be overwritten by regular members.
   - **Automatic Veteran Role (25 Approved Answers)**: Once a member reaches **25 approved answers**, TitanBot automatically creates/assigns the **`@Veteran`** role, granting them permission to **Approve** or **Disapprove** future FAQ submissions in `#bot-logs` (while only Moderators/Admins can permanently delete entries).

---

## Project Structure

```text
TitanBot_MBVN/
├── .github/workflows/       # CI/CD: Docker GHCR publish, schema version check, restore drill
├── lavalink/                # Public Lavalink v4 SSL node list (nodes.json) & self-host config
├── scripts/                 # Database CLI utilities (migrate.js, backup.js, restore.js, restore-drill.js)
├── src/
│   ├── app.js               # Main process entry point, Express health server, and cron scheduler
│   ├── commands/            # 18 modular slash command categories (100 commands total)
│   ├── config/              # Bot settings (bot.js), Postgres pool config, and schema version
│   ├── data/upland/         # Official Upland markdown guides & pre-chunked vector_index.json
│   ├── events/              # Discord Gateway event listeners (interactionCreate, messageCreate, etc.)
│   ├── handlers/            # Command, event, and component interaction loaders
│   ├── interactions/        # Button, select menu, and modal handlers (FAQ review, Upland verify, tickets)
│   ├── services/            # Domain logic (uplandFaqService, verificationService, tickets, music, etc.)
│   └── utils/               # DatabaseWrapper, PostgreSQL driver, schema DDL, logger, rate limiters
├── tests/                   # Automated node --test unit & security regression test suites
├── .env.example             # Environment variable template
├── CHANGELOG.md             # Semantic versioning release notes
├── COMMANDS.md              # Complete 100-command reference & recommended server setup guide
├── Dockerfile               # Hardened non-root Node 20 Alpine production image
├── docker-compose.yml       # Local multi-container stack (Bot + PostgreSQL 15 + optional Lavalink)
├── render.yaml              # Render.com Web Service Blueprint
└── package.json             # Dependencies and npm scripts
```

---

## Step-by-Step Deployment Guide

### Step 1: Discord Developer Portal Setup
Before deploying on any platform, configure your bot application in the [Discord Developer Portal](https://discord.com/developers/applications):
1. Click **New Application** (or select your existing bot).
2. Under **General Information**, copy your **Application ID** → this is your `CLIENT_ID`.
3. Under **Bot**:
   - Copy your **Bot Token** → this is your `DISCORD_TOKEN`.
   - Scroll down to **Privileged Gateway Intents** and enable **all three**:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent** *(Required for `!` prefix commands and passive Upland FAQ chat learning)*
4. Under **OAuth2 → URL Generator**:
   - Check **`bot`** and **`applications.commands`**.
   - Select **`Administrator`** (or Manage Roles, Manage Channels, Manage Messages, Kick/Ban Members, Send Messages, Embed Links, Connect, Speak).
   - Open the generated URL to invite the bot to your Discord server.

---

### Option A: Deploy on Railway (Recommended)
Railway automatically builds the `Dockerfile`, runs health checks against `/health`, and deploys every push to `main`.

1. **Create a Railway Project**:
   - Go to [Railway](https://railway.app/), click **New Project → Deploy from GitHub repo**, and select `2SMOGss/TitanBot_MBVN`.
2. **Add PostgreSQL (or Connect Supabase)**:
   - In your Railway project canvas, click **+ New → Database → Add PostgreSQL** (or use an external Supabase PostgreSQL URI).
3. **Configure Environment Variables**:
   - Click your bot service → **Variables** tab and set:
     ```env
     NODE_ENV=production
     DISCORD_TOKEN=your_discord_bot_token
     CLIENT_ID=your_discord_application_client_id
     GUILD_ID=your_discord_server_id
     POSTGRES_URL=${{Postgres.DATABASE_URL}}
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     POSTGRES_SSL=true
     AUTO_MIGRATE=true
     GEMINI_API_KEY=your_google_gemini_api_key
     GEMINI_MODEL=gemini-3.8-flash
     LOG_LEVEL=warn
     PORT=3000
     ```
4. **Verify Health**:
   - Once Railway marks the deployment **Active**, startup migrations run automatically (`AUTO_MIGRATE=true`) and global slash commands register with Discord.
   - Check the logs for `ONLINE ✅ | 100 commands loaded`.

---

### Option B: Deploy on Render + Supabase
1. Click **[Deploy to Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/2SMOGss/TitanBot_MBVN)** (uses [`render.yaml`](render.yaml)).
2. Enter the prompted secret environment variables:
   - `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `POSTGRES_URL`, `DATABASE_URL`, and `GEMINI_API_KEY`.
3. Verify endpoints once live:
   - Health check: `https://<your-service>.onrender.com/health`
   - Readiness & schema check: `https://<your-service>.onrender.com/ready`
4. **Optional 24/7 Keep-Alive (Render Free Tier)**:
   - Run [`scripts/supabase-keepalive.sql`](scripts/supabase-keepalive.sql) in the Supabase SQL Editor to ping `/health` every 13 minutes from Supabase `pg_cron`.

---

### Option C: Docker & Docker Compose (Self-Hosted / VPS)
Run the bot and a dedicated PostgreSQL 15 container with one command:

```bash
# 1. Clone the repository
git clone https://github.com/2SMOGss/TitanBot_MBVN.git
cd TitanBot_MBVN

# 2. Create and edit your .env file
cp .env.example .env
nano .env   # Fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID, GEMINI_API_KEY, and POSTGRES_PASSWORD

# 3. Build and start the containers in the background
docker compose up -d --build

# 4. Follow live logs
docker compose logs -f bot
```

---

### Option D: Local Node.js Development
Requires **Node.js `>= 20.10.0`** and a running PostgreSQL instance (or runs in automatic in-memory fallback mode for local testing):

```bash
# 1. Install dependencies
npm ci

# 2. Configure environment variables
cp .env.example .env

# 3. Run automated unit & security regression tests (14 tests)
npm test

# 4. Apply/verify PostgreSQL schema migrations
npm run migrate
npm run migrate:check

# 5. Start the bot
npm start
```

---

## First-Time Discord Server Setup

Once the bot is online in your Discord server:
1. **Create or Link `#bot-logs`**:
   - If your server has a channel named **`#bot-logs`** (or `#audit-logs` / `#mod-logs`), TitanBot automatically detects it for Upland FAQ review cards and Upland verification logs!
   - To explicitly configure all moderation, application, and report log channels, run:
     ```text
     /logging channel destination: Audit (moderation, messages, members…) channel: #bot-logs
     ```
2. **Run the Server Configuration Wizard**:
   - Run `/configwizard` to set your server's custom command prefix (default `!`), `@Moderator` role, and `@Admin` role.
3. **Set Up Upland Verification**:
   - Run `/verification setup` in your `#verify` channel to post the verification panel (prompts new members for their in-game **Upland Username** and **Home City**).
4. **Customize Enabled Commands**:
   - Run `/commands dashboard` to toggle any of the 18 command categories on or off for your community.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `DISCORD_TOKEN` | **Yes** | — | Discord Bot Token from Developer Portal. |
| `CLIENT_ID` | **Yes** | — | Discord Application ID used to register global slash commands. |
| `GUILD_ID` | **Yes** | — | Primary Discord Server ID. |
| `GEMINI_API_KEY` | Recommended | `""` | Google Gemini API key for `/ask` RAG synthesis & passive chat distillation (falls back to local BM25 extraction if unset). |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Gemini model identifier used by `uplandFaqService.js`. |
| `OWNER_IDS` | No | `""` | Comma-separated Discord User IDs granted bot owner access. |
| `POSTGRES_URL` | **Yes (Prod)** | — | Full PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). |
| `DATABASE_URL` | No | `POSTGRES_URL` | Alias for `POSTGRES_URL` used by Railway/Render. |
| `POSTGRES_SSL` | No | `true` (Prod) | Set `true` for cloud SSL connections, `false` for local Docker DB. |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED` | No | `false` | Set `true` to enforce strict TLS certificate authority verification. |
| `AUTO_MIGRATE` | No | `true` | Automatically creates/verifies all 19 tables, columns, indexes, and triggers on startup. |
| `PORT` | No | `3000` | Port for the built-in Express `/health` and `/ready` web server. |
| `KEEP_ALIVE_URL` | No | `RENDER_EXTERNAL_URL` | External `/health` URL pinged periodically to prevent cloud sleep. |
| `KEEP_ALIVE_INTERVAL_MS` | No | `810000` | Keep-alive ping interval in milliseconds (`810000` = 13.5 minutes). |
| `LOG_LEVEL` | No | `warn` | Winston log verbosity (`error`, `warn`, `info`, `debug`). |
| `LOG_TO_FILE` | No | `false` | Set `true` to enable daily rotating log files in `./logs`. |

---

## Database Schema, Migrations, Backups & Testing

TitanBot manages **19 PostgreSQL tables** (`guilds`, `users`, `guild_users`, `birthdays`, `giveaways`, `ticket_data`, `afk_status`, `welcome_configs`, `leveling_configs`, `user_levels`, `economy`, `verification_audit`, `invite_tracking`, `application_roles`, `upland_faq_entries`, `upland_faq_contributors`, `temp_data`, `cache_data`, and `schema_migrations`).

| Command | Description |
| :--- | :--- |
| `npm test` | Runs the automated `node --test` unit and security regression test suite (`tests/*.test.js`). |
| `npm run migrate` | Creates all tables, idempotent column migrations, indexes, `updated_at` triggers, and records schema version `v1`. |
| `npm run migrate:check` | Verifies the live database matches `EXPECTED_SCHEMA_VERSION` (`v1` / `baseline-v1`). |
| `npm run migrate:status` | Prints the currently applied schema version and timestamp. |
| `npm run backup:db` | Exports a timestamped JSON/SQL backup to `./backups`. |
| `npm run restore:db` | Restores database state from a backup file. |
| `npm run backup:drill` | Runs an automated backup & restore verification drill. |

---

## Version Control & Instant Rollback

This repository uses **Git** with **Semantic Versioning**, milestone tags, and automated GitHub Actions workflows:

### Milestone & Baseline Rollback Tags
- `v0.0-baseline-0e9cff4` (and branch `backup/pre-teamwork-0e9cff4`) — Pre-audit baseline snapshot.
- `v0.1-m1-faq-security-db` — `/ask` DB migration, overwrite protection, prompt injection defense & memory bounds.
- `v0.2-m2-faq-retrieval-ux` — BM25 precomputation, retrieval accuracy, action row buttons & Veteran threshold.
- `v0.3-m3-core-runtime-memory` — Voice state fix, prefix parser/adapter fixes, Express rate limiter & bounded Maps.
- `v0.4-m4-commands-tooling` — `/weather`, `/say`, `/shorten`, `/wipedata`, native `fetch`, Postgres TLS config.
- `v0.5-m5-tests-verified` — Automated `node --test` unit test suite & full-repo security audit.

To roll back to any tag or previous deployment:
- **In Railway**: Open **Deployments** and click **Rollback** on any previous deployment.
- **Via Git**:
  ```bash
  git checkout main
  git reset --hard <tag-name>
  git push --force-with-lease origin main
  ```

---

## License

Released under the [MIT License](LICENSE).
