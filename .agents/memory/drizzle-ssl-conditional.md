---
name: Drizzle SSL config conditional
description: drizzle.config.ts ssl setting must be conditional on SUPABASE_DB_URL; hardcoding ssl:true breaks Replit's built-in PostgreSQL.
---

## Rule
In `lib/db/drizzle.config.ts`, always make SSL conditional:

```ts
dbCredentials: {
  url: connectionString,
  ssl: !!process.env.SUPABASE_DB_URL,
}
```

**Why:** Replit's built-in PostgreSQL (DATABASE_URL) does not require SSL and rejects SSL connections. Supabase requires SSL. The original Vercel/Supabase project had `ssl: true` hardcoded, which breaks the Replit-native database.

**How to apply:** Any time a Vercel project is ported that previously used Supabase, check `lib/db/drizzle.config.ts` and `lib/db/src/index.ts` for unconditional `ssl: true` and make them conditional.
