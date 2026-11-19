# Changelog

All notable changes to **TitanBot_MBVN** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-11-19

### Added
- **Upland FAQ RAG Assistant & Self-Healing Knowledge Base ([`src/commands/Community/ask.js`](src/commands/Community/ask.js), [`src/services/uplandFaqService.js`](src/services/uplandFaqService.js))**:
  - Added `/ask`, `!ask`, `@TitanBot` mention Q&A, and zero-command passive chat question answering powered by precomputed BM25 retrieval (`src/data/upland/`) and Gemini 2.5 Flash.
  - Added **`💡 Teach / Submit Answer`** modal and **`📚 Community Answers DB`** buttons on `/ask` and `!ask` replies.
  - Added `#bot-logs` auto-detection (`resolveAuditLogChannel`) and interactive **`✅ Approve`** / **`❌ Disapprove`** review cards in [`src/interactions/buttons/faq/faq.js`](src/interactions/buttons/faq/faq.js).
  - Added automatic **`@Veteran`** role unlock at **25 approved community answers**, granting Veterans review permissions while keeping permanent deletion restricted to Moderators/Admins.
- **Upland In-Game Username Verification Modal ([`src/handlers/verificationButtons.js`](src/handlers/verificationButtons.js), [`src/interactions/modals/verification/verifyUplandModal.js`](src/interactions/modals/verification/verifyUplandModal.js))**:
  - Prompts members verifying via the verification button for their in-game **Upland Username** and optional **Home City**, logging linked IGNs to `#bot-logs`.
- **Automated Unit & Security Regression Test Suite ([`tests/uplandFaq.test.js`](tests/uplandFaq.test.js), [`tests/coreAndCommands.test.js`](tests/coreAndCommands.test.js))**:
  - Added 14 `node --test` test suites covering FAQ RBAC overwrite protection, prompt injection sanitization, BM25 retrieval, prefix contractions, synchronous channel/role resolution, bounded memory stores, `/say` mention restrictions, `/shorten` protocol checks, `/wipedata` structured tables, and PostgreSQL TLS settings.

### Changed & Fixed
- **Security & Access Control Hardening**:
  - Protected `verified = true` FAQ entries from being overwritten by non-Staff/non-Veteran users, and ensured `/ask` only serves `status = 'approved'` community answers.
  - Added XML delimiter wrapping (`<user_question>`, `<candidate_answer>`) and control-character sanitization (`sanitizePromptInput`) for all Gemini API prompts.
  - Hardened `/say` ([`src/commands/Moderation/say.js`](src/commands/Moderation/say.js)) with `allowedMentions: { parse: ['users'] }` to prevent `@everyone`, `@here`, and role-ping abuse.
  - Hardened `/shorten` ([`src/commands/Tools/shorten.js`](src/commands/Tools/shorten.js)) to strictly allow `http:` and `https:` URLs.
  - Added configurable `POSTGRES_SSL_REJECT_UNAUTHORIZED` support in [`src/config/database/postgres.js`](src/config/database/postgres.js).
- **Core Runtime, Prefix Commands & Memory Bounds**:
  - Added idempotent `ALTER TABLE upland_faq_entries ADD COLUMN IF NOT EXISTS` startup and CLI migrations (`status`, `reviewed_by`, `reviewed_at`).
  - Fixed [`src/events/voiceStateUpdate.js`](src/events/voiceStateUpdate.js) so music voice-state cleanup runs even when Join-to-Create is disabled.
  - Fixed [`src/utils/prefixParser.js`](src/utils/prefixParser.js) to preserve contractions (`what's`, `don't`, `can't`, `it's`) and [`src/utils/messageAdapter.js`](src/utils/messageAdapter.js) to resolve `getChannel()` and `getRole()` synchronously.
  - Fixed `/weather` humidity lookup ([`src/commands/Utility/weather.js`](src/commands/Utility/weather.js)) and deduplicated `/reactroles` autocomplete fetches ([`src/events/interactionCreate.js`](src/events/interactionCreate.js)).
  - Added TTL and max-size eviction across all in-memory Maps (`app.js`, `uplandFaqService.js`, `rateLimiter.js`, `abuseProtection.js`, `interactionCreate.js`, `calculate.js`) and respected `LOG_TO_FILE=false` in [`src/utils/logger.js`](src/utils/logger.js).
  - Replaced `axios` with native `fetch` in Search commands and removed unused `axios` dependency and dead `src/utils/commandPipeline.js`.

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
