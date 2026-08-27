# Claude Code Instructions

## Project purpose

This is Chris and Sarah's private browser-based food tracker. It is a React
19/Vinext application running on Cloudflare Workers with a Cloudflare D1
database. It does not use Python and must remain usable from an iPhone browser.

## Local workspace and shell

- Windows project directory: `D:\webserver\foodTracker`
- Provide and run commands in Windows PowerShell.
- Node.js must be 22.13 or newer.
- Before changing anything, run:

  ```powershell
  git branch --show-current
  git status --short
  ```

- Work only on the `working` branch. If the current branch is `master`, stop
  and ask Chris before making changes.
- The local working tree may contain newer changes than GitHub. Treat the local
  files and `git status` as the source of truth. Never discard or overwrite
  unrelated changes.

## Claude Code workflow

Claude Code may edit files directly in the local working tree and run safe local
builds and tests. The patch-only instructions in `AGENTS.md` apply to changes
delivered through ChatGPT, not to Claude Code working locally.

Do not commit, push, merge into `master`, deploy production, or run a remote D1
migration unless Chris explicitly asks. Never use destructive Git commands such
as `git reset --hard` or `git checkout --` on user changes.

After code changes, show:

1. Files changed.
2. Whether a database migration was added.
3. Commands Chris should run and the directory where they run.
4. Which commands are one-time and which belong in `Push to Production.md`.

## Local development

Install dependencies when needed:

```powershell
npm install
```

Start the local site:

```powershell
npx vite
```

Use the local URL printed by Vite. The Cloudflare Vite plugin runs the Worker
locally and persists the development D1 database under:

```text
.local-data
```

Validate a Windows build with:

```powershell
npm run build:windows
```

Wrangler and `@cloudflare/vite-plugin` must support the compatibility date in
`vite.config.ts`. If the local runtime reports that the compatibility date is
too new, update both development dependencies rather than lowering the
application compatibility date:

```powershell
npm install --save-dev wrangler@latest @cloudflare/vite-plugin@latest
```

## Local D1 database

Local binding:

- Binding: `DB`
- Database name: `food-tracker-db`
- Database ID: `e998b960-0351-4cfa-8043-41780649bf13`
- Wrangler config: `wrangler.local.jsonc`
- Vite persistence directory: `.local-data`

The local Wrangler configuration must use the same binding, database name, and
database ID as `vite.config.ts`.

Run a new migration locally with:

```powershell
npx wrangler d1 execute DB --local --config=.\wrangler.local.jsonc --persist-to=.\.local-data --file=.\drizzle\<migration-file>.sql
```

Migrations `0000` through `0009` are already established. Do not normally
rerun them. New schema changes must use the next numbered SQL file in
`drizzle`, starting with `0010_...`.

## Production

Production application:

```text
https://food-tracker.hubbard-foodtracker.workers.dev
```

Production infrastructure:

- Cloudflare Worker: `food-tracker`
- D1 database: `food-tracker-db`
- D1 binding: `DB`
- D1 database ID: `e998b960-0351-4cfa-8043-41780649bf13`
- Cloudflare Access restricts the site to Chris and Sarah using emailed login
  codes.

Every migration in `drizzle` through `0009_fat_breakdown.sql` has already
been applied to production. Never apply those production migrations again.
`Push to Production.md` holds the authoritative list.

For a newly created migration, the production command is:

```powershell
npx wrangler d1 execute food-tracker-db --remote --file=.\drizzle\<migration-file>.sql
```

Production code deployment is:

```powershell
npm run deploy
```

Both production commands must be run from `D:\webserver\foodTracker`, and
only after Chris explicitly approves the production action. A new migration
must be applied remotely before deploying code that requires its new schema.

## Data behavior that must be preserved

- Chris and Sarah use separate profiles and all records remain separated by
  owner.
- Food diary entries store a nutrition snapshot. Editing a saved custom food
  must not alter historical diary entries.
- Editing a diary item changes only that specific diary entry.
- Saved custom foods retain nutrition for one full serving.
- Fractional servings, such as `0.50`, scale the diary nutrition values.
- Nutrition values support two decimal places.
- Net carbohydrates are calculated as total carbohydrates minus fiber.
- Total fat is the primary fat value and is never derived from its subtypes.
- Saturated, trans, monounsaturated, and polyunsaturated fat are nullable.
  Null means the value was never recorded; 0 means a source reported none.
  Never turn a missing subtype into a zero, never force the four to add up to
  total fat, and never show an unknown value as `0 g`.
- Never expose one profile's data to the other profile.
- Every update and delete must include the current profile/owner in its database
  condition.

## Current feature set

- Breakfast, lunch, dinner, and snack diary entries
- Manual and reusable custom foods
- My Foods management and editing
- Editing individual diary entries
- Ounce servings and fractional serving scaling
- Calories, protein, total fat, saturated/trans/monounsaturated/polyunsaturated
  fat, total carbs, fiber, and net carbs
- Per-profile daily goals
- Water tracking
- Exercise tracking
- Cloudflare Access protection

Always inspect the actual local code before assuming a recently added feature is
present, because Chris may not have committed or pushed the latest local work.

## Planned work

See `ToDo.md`. The major planned feature is Google Gemini-assisted meal entry.
It should accept typed or dictated ingredients and quantities, return food name,
serving, calories, protein, fat, total carbs, and fiber, then require review
before adding the diary entry or saving a custom food.

Never place Gemini or other API keys directly in source control. Use
ignored local environment files for development and Cloudflare secrets for
production.

## Implementation rules

- Keep the existing React/Vinext/Cloudflare architecture.
- Use Drizzle ORM and D1-compatible SQLite.
- Preserve the mobile-first interface.
- Validate API input and return useful error messages.
- Scope reads, updates, and deletes by profile ownership.
- Do not add a paid service without discussing it with Chris.
- Update `README.md`, `ToDo.md`, or production instructions when a change
  makes them inaccurate.

