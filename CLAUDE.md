# Food Tracker - Claude Code

Private food and workout tracker for Chris and Sarah. Keep the existing React
19, TypeScript, Vinext, Cloudflare Workers/D1, and Drizzle architecture. Prioritize
the iPhone browser and free services. Use Sonnet for planning and implementation;
do not require another model or a team of agents for ordinary work.

## Start every task

- Work from `D:\webserver\foodTracker` using Windows PowerShell.
- Check `git branch --show-current` and `git status --short` before edits.
  Edit only on `working`; ask before switching or creating branches.
- Local code and uncommitted work are the implementation source of truth.
  Preserve unrelated changes. Inspect relevant code before relying on old notes.
- Read only the documents relevant to the task from the table below.

## Work in small, complete increments

1. Identify the requested outcome and affected behavior.
2. For a contained fix, explain the approach briefly and implement it.
3. For schema, security, integration, multi-feature, or substantial refactoring
   work, use `docs/plans/TEMPLATE.md`. Plan in Sonnet. An explicit implementation
   request authorizes routine implementation choices; ask only about unresolved
   material product decisions. Reuse an accepted plan rather than planning twice.
4. Implement one coherent slice, verify it, and review the diff.
5. Update only documentation made inaccurate by the change. Report changes,
   checks actually run, remaining gaps, and whether a migration was added.

If the plan becomes materially wrong, explain the evidence and revise it before
continuing. After three materially different failed approaches, stop and report
the blocker instead of looping. Do not expand a small task into a general rewrite.

## Boundaries

Claude Code may edit locally and run safe local checks. ChatGPT patch delivery is
defined in `AGENTS.md`. Do not commit, push, merge, deploy, or run remote database
commands without Chris's explicit instruction. Never discard user changes.
Do not read secrets, `.dev.vars`, private exports, or `production-snapshot.sql`
as routine context. Never put credentials or personal records in logs or fixtures.
Discuss paid services and material dependency changes before adding them.

## Read only when relevant

| Task | Reference |
| --- | --- |
| Locate implementation or understand current features | `docs/architecture.md` |
| UI, API, or integration changes | `docs/standards/engineering.md` |
| Nutrition, diary, goals, reports, or workouts | `docs/standards/data-behavior.md` |
| Schema, migrations, local D1, or release preparation | `docs/standards/database-release.md` |
| Verification and finishing work | `docs/standards/verification.md` |
| Substantial feature plan | `docs/plans/TEMPLATE.md` |
| Feature requests | `ToDo.md` (verify status against code) |
| Production migration history and deployment | `Push to Production.md` |

## Keep the instructions small

Do not append completed-feature narratives, migration counters, or session logs
here. Put durable rules in the relevant standard, operational details in their
runbook, and unfinished feature work in `ToDo.md`. Apply Chris's corrections to
the task; propose general rules in `docs/standards/pending.md` before treating
them as permanent policy. No extra documentation is needed for a routine fix.
