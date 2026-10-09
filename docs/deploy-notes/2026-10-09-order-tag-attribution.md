# Deploy note — 2026-10-09 · order channel attribution (`?tag=`)

`main` was fast-forwarded from `b8dbd84` to the head of
`feature/order-tag-attribution`. This note records a second exception to
the merge gate, and the state of the deployment at the moment of merge.

## Recorded limitation — merge-gate exception

`CLAUDE.md` requires `npm run test:regression` at **0 FAIL** before a
merge to `main`. **That gate was not met.** The repository owner
authorized the merge on 2026-10-09 on the evidence below. No test file
and no rule was modified to obtain it.

This is the second such exception (the first was `b8dbd84`, recorded in
`2026-09-25-intake-short-links.md` on `claude/quirky-keller-191cp3`). It
is granted on the explicit understanding that the schema-capture work
below retires both.

### What passed

| Suite | Result |
| --- | --- |
| `test:datetime` (UTC + America/Chicago) | 157 PASS / 0 FAIL |
| `test:intake` (UTC + America/Chicago) | 169 PASS / 0 FAIL |
| `test:attribution` | 115 PASS / 0 FAIL |
| `test:tag:db` (throwaway PostgreSQL 16) | 73 PASS / 0 FAIL |
| `test:intake:db` (throwaway PostgreSQL 16) | 66 PASS / 0 FAIL |

### What failed, and why it is not this change

`scripts/test-regression.js`: **199 PASS / 37 FAIL / 22 SKIP**.

`comm -23` of this run's failure list against the stored `main` baseline
returns **nothing** — every one of the 37 is a failure `main` already
produces. They trace to four objects that exist only in the production
database and appear in no migration file:

- table `orders`
- table `users`
- function `create_order_atomic()`
- function `redeem_order_atomic()`

plus the `restaurants.slug` NOT NULL mismatch and one test/copy mismatch,
both of which also fail identically on `main`.

Eight of the 37 are `create_order_atomic` not found. A missing RPC
produces `fail()`, not `skip()`, so no configuration makes this suite
green offline.

## Deployment state at merge

**migration-012-order-tag.sql was NOT applied when this was merged.**

The documented deploy order is SQL first, then code. This merge inverts
it, which is safe by construction and not by luck:

`lib/orders/create-order-rpc.ts` falls back to the nine-argument
signature when PostgREST answers `PGRST202`. Until 012 is applied, every
real order therefore:

- is created normally, with `tag` absent;
- logs `webhook_rpc_signature_fallback` once per order.

That log line is the signal that 012 is still outstanding. It stops the
moment the migration lands. Attribution degrades; the order does not.

## How both exceptions get retired

Capture the four production-only objects into a migration file so the
repository can rebuild its own database. Two of the four are already in
hand from the 2026-10-09 capture (`create_order_atomic`, and the `orders`
and `drop_items` column lists). Still needed:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'redeem_order_atomic';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
```

With those, `npm run test:regression` becomes satisfiable offline and no
future merge needs an exception.
