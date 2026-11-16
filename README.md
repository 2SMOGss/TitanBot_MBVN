# TitanBot MBVN

**TitanBot MBVN** is a modular, production-ready Discord community, moderation, economy, and utility bot built with **Discord.js v14**, **Express 5**, **Lavalink v4 (Riffy)**, and **PostgreSQL 17 (Supabase)**.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.10.0-339933?logo=node.js&logoColor=white&style=flat-square)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.26-5865F2?logo=discord&logoColor=white&style=flat-square)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%20(Supabase)-336791?logo=postgresql&logoColor=white&style=flat-square)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Feature Modules (99 Slash Commands)](#feature-modules-99-slash-commands)
3. [Project Structure](#project-structure)
4. [24/7 Cloud Deployment (Render + Supabase PostgreSQL)](#247-cloud-deployment-render--supabase-postgresql)
5. [Local & Docker Development](#local--docker-development)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Database Schema, Migrations & Backups](#database-schema-migrations--backups)
8. [Version Control & Release Workflow](#version-control--release-workflow)

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Discord["Discord Platform"]
        GW["Discord Gateway<br/>(WebSocket Intents)"]
        REST["Discord REST API v10<br/>(99 Global Slash Commands)"]
    end

    subgraph Runtime["TitanBot MBVN (Node 20 Alpine / Non-Root)"]
        APP["src/app.js<br/>Client + Cron Scheduler"]
        HTTP["Express Server (:3000)<br/>GET /health & /ready"]
        KEEP["13.5-Min Keep-Alive<br/>(810,000 ms Timer)"]
        DBW["DatabaseWrapper<br/>(PostgreSQL -> Memory Fallback)"]
    end

    subgraph Infra["Managed Cloud Infrastructure"]
        SUPA[("Supabase PostgreSQL 17<br/>17 RLS-Protected Tables<br/>(Supavisor Pooler)")]
        LAVA["Lavalink v4 SSL Nodes<br/>(lavalink/nodes.json)"]
    end

    GW <--> APP
    APP --> REST
    APP --> HTTP
    KEEP -->|"HTTPS GET /health"| HTTP
    APP --> DBW
    DBW <-->|"TLS Pool"| SUPA
    APP <-->|"Riffy v4"| LAVA
```

- **Multi-Guild Isolation**: Every server's configuration, economy, leveling, tickets, and moderation records are scoped by `guild_id` (`guild:{guildId}:...`).
- **Graceful Degradation**: If PostgreSQL is temporarily unreachable, `DatabaseWrapper` falls back to in-memory storage and surfaces degraded status on `GET /ready` (`HTTP 503`).
- **Built-in 13.5-Minute Keep-Alive**: Automatically pings `KEEP_ALIVE_URL` / `RENDER_EXTERNAL_URL` every `810,000 ms` (13.5 minutes) so free cloud web service containers never hit 15-minute idle spin-down limits.

---

## Feature Modules (99 Slash Commands)

| Category | Key Capabilities |
| :--- | :--- |
| **Moderation & Logging** | Ban, kick, timeout, warn, mass actions, user notes, case management, and configurable audit log dashboards (`/logging`). |
| **Support Tickets** | Interactive ticket panels, staff claiming, priority levels (`low` to `urgent`), per-user open limits, transcripts, and archiving. |
| **Verification** | Button-based member verification panels, account-age gates, rate limiting, and persistent `verification_audit` logging. |
| **Economy & Shop** | Per-server balances, bank storage, daily rewards, work/beg/crime/rob commands, customizable shop items, and leaderboards. |
| **Leveling & XP** | Message XP tracking with cooldowns, level-up announcements, milestone role rewards, and server rank leaderboards. |
| **Community & Applications** | Multi-question application modals, staff review buttons (Approve/Deny), role assignment, and automatic retention cleanup. |
| **Giveaways & Birthdays** | Multi-winner giveaways with automatic cron completion/rerolls, plus timezone-aware daily birthday announcements. |
| **Voice & Music** | Dynamic Join-to-Create temporary voice channels and 24/7 Lavalink v4 music playback (`/play`, `/music`, `/queue`, `/nowplaying`). |
| **Server Stats & Roles** | Auto-updating member/bot/human voice counter channels (every 15 min) and interactive Reaction Role panels. |

> Global feature toggles, embed colors, currency settings, and cooldowns can be customized in [`src/config/bot.js`](src/config/bot.js).

---

## Project Structure

```text
TitanBot_MBVN/
├── .github/workflows/       # CI/CD: Docker GHCR publish, schema version check, restore drill
├── lavalink/                # Public Lavalink v4 SSL node list (nodes.json) & self-host config
├── scripts/                 # Database CLI utilities (migrate.js, backup.js, restore.js, restore-drill.js)
├── src/
│   ├── app.js               # Main process entry point, Express health server, and cron scheduler
│   ├── commands/            # 18 modular slash command categories (99 commands total)
│   ├── config/              # Bot settings (bot.js), Postgres pool config, and schema version
│   ├── events/              # Discord Gateway event listeners
│   ├── handlers/            # Command, event, and component interaction loaders
│   ├── interactions/        # Button, select menu, and modal handlers
│   ├── services/            # Domain logic (tickets, giveaways, birthdays, server stats, music)
│   └── utils/               # DatabaseWrapper, PostgreSQL driver, schema DDL, logger, error handler
├── .env.example             # Environment variable template
├── CHANGELOG.md             # Semantic versioning release notes
├── Dockerfile               # Hardened non-root Node 20 Alpine production image
├── docker-compose.yml       # Local multi-container stack (Bot + PostgreSQL 15 + optional Lavalink)
├── render.yaml              # Render.com Free Web Service Blueprint
└── package.json             # Dependencies and npm scripts
```

---

## 24/7 Cloud Deployment (Render + Supabase PostgreSQL)

### 1. Required Discord Bot Settings
In the [Discord Developer Portal](https://discord.com/developers/applications):
1. Copy **Application ID** (`CLIENT_ID`) from **General Information**.
2. Copy **Bot Token** (`DISCORD_TOKEN`) from **Bot**, and enable all three **Privileged Gateway Intents**:
   - **Presence Intent**
   - **Server Members Intent**
   - **Message Content Intent**
3. Under **OAuth2 → URL Generator**, select `bot` + `applications.commands` scopes and `Administrator` permissions to invite the bot to your server.

### 2. Deploy via Render Blueprint
1. Click **[Deploy to Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/2SMOGss/TitanBot_MBVN)**.
2. Supply the prompted secret environment variables:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `POSTGRES_URL` *(Supabase Session Pooler URI)*
   - `DATABASE_URL` *(Same as `POSTGRES_URL`)*
3. Verify deployment status:
   - Health check: `https://titanbot-mbvn.onrender.com/health`
   - Readiness & schema check: `https://titanbot-mbvn.onrender.com/ready`

---

## Local & Docker Development

### Option A: Local Node.js
```bash
# 1. Install dependencies
npm ci

# 2. Configure environment variables
cp .env.example .env

# 3. Verify PostgreSQL schema (v1 / baseline-v1)
npm run migrate:check

# 4. Start the bot
npm start
```

### Option B: Docker Compose (Bundled PostgreSQL 15)
```bash
cp .env.example .env
# Edit .env with DISCORD_TOKEN, CLIENT_ID, GUILD_ID, and POSTGRES_PASSWORD
docker compose up -d --build
docker compose logs -f bot
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `DISCORD_TOKEN` | **Yes** | — | Discord Bot Token from Developer Portal. |
| `CLIENT_ID` | **Yes** | — | Discord Application ID used to register global slash commands. |
| `GUILD_ID` | **Yes** | — | Primary Discord Server ID (`MBVN-DEV`). |
| `OWNER_IDS` | No | `""` | Comma-separated Discord User IDs granted bot owner access. |
| `POSTGRES_URL` | **Yes (Prod)** | — | Full PostgreSQL connection string (`postgresql://user:pass@host:5432/db`). |
| `DATABASE_URL` | No | `POSTGRES_URL` | Alias for `POSTGRES_URL` used by cloud providers. |
| `POSTGRES_SSL` | No | `true` (Prod) | Set `true` for Supabase/cloud SSL connections, `false` for local Docker DB. |
| `AUTO_MIGRATE` | No | `true` | Automatically creates/verifies all 17 tables and triggers on startup. |
| `PORT` | No | `3000` | Port for the built-in Express `/health` and `/ready` web server. |
| `KEEP_ALIVE_URL` | No | `RENDER_EXTERNAL_URL` | External `/health` URL pinged periodically to prevent cloud sleep. |
| `KEEP_ALIVE_INTERVAL_MS` | No | `810000` | Keep-alive ping interval in milliseconds (`810000` = 13.5 minutes). |
| `LOG_LEVEL` | No | `warn` | Winston log verbosity (`error`, `warn`, `info`, `debug`). |

---

## Database Schema, Migrations & Backups

TitanBot manages **17 PostgreSQL tables** (`guilds`, `users`, `guild_users`, `birthdays`, `giveaways`, `ticket_data`, `afk_status`, `welcome_configs`, `leveling_configs`, `user_levels`, `economy`, `verification_audit`, `invite_tracking`, `application_roles`, `temp_data`, `cache_data`, and `schema_migrations`).

| Command | Description |
| :--- | :--- |
| `npm run migrate` | Creates all tables, indexes, `updated_at` triggers, and records schema version `v1`. |
| `npm run migrate:check` | Verifies the live database matches `EXPECTED_SCHEMA_VERSION` (`v1` / `baseline-v1`). |
| `npm run migrate:status` | Prints the currently applied schema version and timestamp. |
| `npm run backup:db` | Exports a timestamped JSON/SQL backup to `./backups`. |
| `npm run restore:db` | Restores database state from a backup file. |
| `npm run backup:drill` | Runs an automated backup & restore verification drill. |

---

## Version Control & Release Workflow

This repository uses **Git** with **Semantic Versioning** (`vMAJOR.MINOR.PATCH`) and automated GitHub Actions workflows:

- **Continuous Integration**:
  - [`.github/workflows/migration-version-check.yml`](.github/workflows/migration-version-check.yml) — Verifies PostgreSQL migrations on every push and pull request.
  - [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) — Builds and publishes container images to GitHub Container Registry (`ghcr.io`) on pushes to `main` and version tags (`v*.*.*`).
  - [`.github/workflows/restore-drill.yml`](.github/workflows/restore-drill.yml) — Weekly automated database backup/restore verification.

### Creating a New Version Release
1. Update [`CHANGELOG.md`](CHANGELOG.md) with your changes.
2. Bump the version in `package.json` and create a signed Git tag:
   ```bash
   # Patch release (e.g. 2.1.0 -> 2.1.1)
   npm version patch -m "chore(release): v%s"

   # Minor feature release (e.g. 2.1.0 -> 2.2.0)
   npm version minor -m "chore(release): v%s"

   # Push commits and version tags to GitHub
   git push origin main --follow-tags
   ```

---

## License

Released under the [MIT License](LICENSE).
