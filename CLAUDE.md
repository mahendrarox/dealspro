# Project Rules — DealsPro

## Session Rules (take precedence over everything below)

- Never merge or push unless the current task explicitly authorizes it.
- On Windows/Git Bash, never run timezone tests via TZ= prefixes — TZ
  does not propagate (MSYS mangles values containing a slash). Always
  use `npm run test:datetime` and verify the printed "Intl resolved TZ"
  line.

## Merge Rule

When a task explicitly authorizes merging, merge the branch into `main` and
push — but ONLY after `npm run test:regression` passes with **0 failures**.
Without that authorization, finish on the branch and report; do not merge.

- Merging/pushing requires explicit authorization in the current task
  (see Session Rules above). Green tests are a precondition, never an
  authorization.
- Do **NOT** merge if any tests fail.
- Skipped tests are acceptable (e.g. tests gated on manual Supabase migration
  application); failures are not.

### Sequence
1. Finish the work on the feature/fix branch.
2. Run `npm run test:regression`.
3. Verify output shows `0 FAIL`.
4. `git checkout main`
5. `git merge <feature-branch>`
6. `git push origin main`
7. Confirm the push succeeded before reporting the task complete.

### Exceptions
- If the user explicitly says "don't merge" or "keep on branch", respect that.
- If the merge would require resolving conflicts, stop and surface the conflict
  instead of auto-resolving.
- Never force-push to `main`.
