# Agent Instructions

- Treat GitHub as read-only. Never commit, push, merge, create branches, or modify the repository directly.
- Deliver all code changes as downloadable patch files.
- Provide commands for Windows PowerShell.
- Keep responses short unless more detail is requested.
- Always state the directory where each command must be run.
- Always explain when each command should be run.
- Clearly identify one-time setup commands.
- Clearly identify commands that belong in the “Code Push to Production” document.
- Database migrations must be provided as numbered SQL files in the `drizzle` directory.
- Clearly state whether a migration should run locally, against the remote Cloudflare D1 database, or both.
- Never instruct the user to rerun an already-applied production migration.
- Production code is deployed with:

  ```powershell
  npm run deploy


  Production D1 migrations use:
  npx wrangler d1 execute food-tracker-db --remote --file=.\drizzle\<migration-file>.sql
  ```
