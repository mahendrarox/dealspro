# Deploy note — 2026-09-25 · short private intake links (`b8dbd84`)

`main` was fast-forwarded from `c4ae3fc` to `b8dbd84` and deployed to
production. This note exists because that deploy went out under an
explicit, one-time exception to the merge gate — it is not a precedent,
and nothing was changed to make the gate appear satisfied.

## Recorded limitation — one-time full-regression exception

`CLAUDE.md` requires `npm run test:regression` at **0 FAIL** before a
merge to `main`. **That gate was not met for this deploy.** The
repository owner granted a one-time exception on 2026-09-25 on the
evidence below. No test file and no rule was modified to obtain it.

### What passed

| Suite | Result |
| --- | --- |
| `test:datetime` | 157 PASS / 0 FAIL (UTC and America/Chicago) |
| `test:intake` | 169 PASS / 0 FAIL (UTC and America/Chicago) |
| `test:intake:db` | 66 PASS / 0 FAIL (isolated PostgreSQL 16 cluster, real migration files applied) |

### What could not run, and why

`scripts/test-regression.js` cannot reach 0 FAIL in **any** database
built from this repository, because four objects it depends on exist
only in the production database and appear in no migration file:

- table `orders`
- table `users`
- function `create_order_atomic()`
- function `redeem_order_atomic()`

A missing RPC produces `fail()`, not `skip()`, so no configuration makes
this suite green offline. Reconstructing those four objects by hand
would have tested the reconstruction rather than production, so it was
not done.

### Evidence accepted in place of the gate

Same disposable database, rebuilt identically, same seed, both refs:

| Ref | Result |
| --- | --- |
| `c4ae3fc` — `main`, then live in production | 203 PASS / 58 FAIL / 3 SKIP |
| `b8dbd84` — this commit | 203 PASS / 58 FAIL / 3 SKIP |

The two failure lists are **identical**, so `b8dbd84` introduces no new
failures. All 58 pre-existing failures trace to the four missing objects
above, plus a `restaurants.slug` NOT NULL constraint and one test/copy
mismatch — each of which fails identically on `main`.

### Production database state at deploy time

Verified read-only by the repository owner in the Supabase SQL editor,
with migration-010 already applied:

- `intake_links` and `intake_legacy_cutoffs` present, RLS enabled, zero policies
- zero `TRUNCATE` / `REFERENCES` / `TRIGGER` privileges for `anon` and
  `authenticated` on `intake_links`, `intake_legacy_cutoffs` and
  `drop_submissions`
- `service_role` retains `SELECT` / `INSERT` / `UPDATE`
- structural checks passed (unique `code_hash` index, length CHECK, FK cascade)

## How to retire this exception

Capture the four production-only objects into a migration file. After
that the gate is satisfiable offline and the repository can rebuild its
own database — which today it cannot. Dump them read-only with:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_order_atomic', 'redeem_order_atomic');

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('orders', 'users')
ORDER BY table_name, ordinal_position;
```
