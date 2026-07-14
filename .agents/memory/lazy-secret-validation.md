---
name: Lazy secret validation for optional-at-boot config
description: Validate required secrets/config at point-of-use, not at module import/startup, when a service should still boot before secrets exist.
---

Some ported/imported services eagerly validate required env vars (DB connection string, author/tenant IDs, etc.) at module load time, throwing and crashing the process if unset. That's a reasonable pattern for a fully-configured deployment, but it means the service can't even boot in an environment where the user hasn't provided secrets yet (e.g. right after a port/import, before they've added their real DB URL).

**Why:** the user may legitimately want to see the app running and verify code correctness before wiring up production secrets like a Supabase URL or a scraping API key. A hard crash at import time blocks all verification, even features that don't need that secret.

**How to apply:** convert eager validation into lazy validation — a getter function called at the actual point of use — so the process boots cleanly and only the specific feature that needs the missing secret fails, with the same explicit error message as before (never silently fall back to fake data). For DB connections created eagerly at module scope (e.g. a `pg.Pool` built at import time), wrap access behind a lazily-initialized accessor (e.g. a `Proxy` that constructs the real pool on first property access, binding methods to the real instance) so `resolveDbConfig()`-style validation only runs when a query actually happens. Note: some environments provide an ambient local `DATABASE_URL` (e.g. Replit's default local Postgres) that a `SUPABASE_DB_URL ?? DATABASE_URL`-style fallback will silently pick up — useful for smoke-testing schema/CRUD before the real external secret is added, but tables/extensions owned only by the external DB (e.g. a shared `knowledge_base` table with pgvector) won't exist there.
