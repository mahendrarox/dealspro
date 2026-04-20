# Project Rules — DealsPro

## Merge Rule (MANDATORY)

After every task, if the work is on a branch (not `main`), automatically merge
into `main` and push — but ONLY after `npm run test:regression` passes with
**0 failures**.

- Do **NOT** wait for the user to ask for a merge.
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
