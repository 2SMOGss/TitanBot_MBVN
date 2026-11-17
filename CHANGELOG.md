# Changelog

All notable changes to **TitanBot_MBVN** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-11-16

### Added
- **Render Blueprint ([render.yaml](render.yaml))**: Declarative 1-click Free Web Service deployment configuration wired to `/health` and `/ready`.
- **Supabase External Keep-Alive Cron ([scripts/supabase-keepalive.sql](scripts/supabase-keepalive.sql))**: Configured `pg_cron` + `pg_net` (`titanbot_render_keepalive`, `*/13 * * * *`) inside Supabase PostgreSQL 17 to send external HTTP GET pings from AWS to Render's `/health` endpoint every 13 minutes, preventing Render Free tier idle spin-downs 24/7.
- **13.5-Minute Self Keep-Alive ([src/app.js](src/app.js))**: Built-in external HTTPS keep-alive timer (`KEEP_ALIVE_INTERVAL_MS=810000`) targeting `KEEP_ALIVE_URL` / `RENDER_EXTERNAL_URL` so Free Web Service instances remain online 24/7 within the 750-hour monthly budget.
- **Supabase PostgreSQL 17 Support**: Configured IPv4-compatible Supavisor pooler settings (`POSTGRES_SSL=true`) with Row Level Security (RLS) policies on all 17 tables.

### Changed
- **Container Security Hardening ([Dockerfile](Dockerfile), [docker-compose.yml](docker-compose.yml))**:
  - Dropped `root` privileges inside the container (`USER node`) and pre-created `/usr/src/app/logs` and `/usr/src/app/backups` with `node:node` ownership.
  - Restricted local Docker Compose port binding to `127.0.0.1:3000:3000` and enabled `no-new-privileges:true`.
- **Repository Cleanup & Documentation ([README.md](README.md))**:
  - Removed legacy `index.js` shim and redundant `roadmap.txt`.
  - Updated `.github/CODEOWNERS` and `package.json` repository metadata for `2SMOGss/TitanBot_MBVN`.
