# Agent Instructions

Read `CLAUDE.md` for the shared project workflow and task-specific references.

- Claude Code working locally may edit the working tree and run safe local checks.
- Changes delivered through ChatGPT must remain downloadable patches. Do not
  directly modify this repository through ChatGPT.
- GitHub is read-only unless Chris explicitly requests a Git action. Do not
  commit, push, merge, or create branches as an implied step of implementation.
- Preserve all unrelated local changes.
- Use Windows PowerShell. Keep explanations short. For user-run commands, state
  the working directory and when to run them; distinguish one-time setup from
  routine verification and production steps.
- Schema changes use numbered SQL files in `drizzle`. Specify local versus remote
  application, never rerun an applied migration, and follow
  `docs/standards/database-release.md` and `Push to Production.md`.
