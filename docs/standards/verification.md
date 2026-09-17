# Verification

Run from `D:\webserver\foodTracker` in Windows PowerShell, after relevant edits.
No new packages are required for the helper. It never migrates or deploys.

```powershell
# Ordinary logic/API changes: existing unit regression suite
.\scripts\verify.ps1 -Mode Unit
# TypeScript/React changes: type checking, then unit suite
.\scripts\verify.ps1 -Mode Quick
# Broader changes/release preparation: types, unit suite, lint, Windows build
.\scripts\verify.ps1 -Mode Full
```

Use a single related test while iterating when that is enough:

```powershell
node --experimental-strip-types --import ./tests/register-ts.mjs --test tests/unit/nutrition-percentages.test.mjs
```

The helper uses installed local tools and stops on failure. It does not install
dependencies. A full build writes normal generated output; it does not establish
that production migrations are applied or that a release is approved.

Existing `npm test`, `npm run build`, and `npm run lint` use Bash/Sites wrappers;
retain them for their original environment. `tests/rendered-html.test.mjs` expects
development-preview metadata from that environment and is not silently included
in the native Windows helper. Run that environment's `npm test` when modifying
preview/rendering behavior, and report if it was not available.

For changed behavior add focused regression coverage: owner isolation, historical
snapshots, repeated saves, missing versus zero values, serving calculations, or
date boundaries as relevant. Do not add tests that merely repeat the implementation.
Documentation-only changes need reference/diff checks, not an application rebuild.

For UI work also verify the affected flow at a phone viewport: save/edit/cancel,
loading/errors, and the other profile where applicable. Automated success does
not replace camera, Safari, or visual checks; state what was and was not checked.

Before handoff inspect the diff for unrelated changes, secrets, data regressions,
and missing docs/migrations. Report exact checks and outcomes. Distinguish existing
failures from regressions using evidence; never call an unrun check passed.
