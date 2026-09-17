# Database and release operations

Run commands from `D:\webserver\foodTracker` in PowerShell.

## Schema work

Read `db/schema.ts`, relevant routes/tests, existing `drizzle/*.sql`, and
`Push to Production.md`. Determine the next migration number from actual files;
never keep a next-number counter in AI instructions. Do not edit an applied
migration. Provide a new numbered SQL file and keep the Drizzle schema aligned.

Plan ownership, defaults/nullability, existing-data effects, and verification
before implementing a schema change. Use synthetic fixtures to test migration
behavior when meaningful. Never restore a production snapshot as a casual test.

## Local development

Node must satisfy `package.json` (currently >=22.13). Install existing locked
dependencies with `npm ci` only when setup is needed. Start Vite with `npx vite`.
Use the printed URL. Local persistence is `.local-data`.

For a new, not-yet-applied LOCAL migration, after confirming the target and any
effect on saved development data:

```powershell
npx wrangler d1 execute DB --local --config=.\wrangler.local.jsonc --persist-to=.\.local-data --file=.\drizzle\<migration-file>.sql
```

Verify `DB`, database name, and database ID agree between `vite.config.ts` and
`wrangler.local.jsonc`. Do not delete `.local-data` to work around a failure.

## Production

`Push to Production.md` is the migration/deployment ledger. Its recorded status
must be confirmed before executing any migration; never infer applied status
from a filename or mark a migration applied just because it was created.
Remote commands and deployment require Chris's explicit instruction.

After authorization, a new production migration is applied before code requiring
it. Use these existing operations, with a real unapplied filename:

```powershell
npx wrangler d1 execute food-tracker-db --remote --file=.\drizzle\<migration-file>.sql
npm run deploy
```

Report local and production migration steps separately. Update the ledger only
with observed/confirmed outcomes. Secret setup is one-time or rotation work,
not a normal code push. Keep keys in ignored local configuration and Cloudflare
secrets. Do not repeat historical setup steps blindly.
