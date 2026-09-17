# OpenCode Findings

Codebase review of the Daily Food Tracker project. Findings are organized by severity and category.

---

## Critical Issues

### 1. Drizzle Migration Journal is Stale

`drizzle/meta/_journal.json` only tracks migration `0000` out of 13 total migrations. Running `npx drizzle-kit migrate` would attempt to re-apply all migrations, which would fail on already-applied `ALTER TABLE ADD COLUMN` statements. The project works around this by running SQL files directly via `wrangler d1 execute` and the test harness, but the journal is effectively broken.

### 2. No Server-Side Authentication on API Routes

The `x-food-tracker-profile` header is the sole mechanism for data isolation. There is no server-side session, token, or identity verification. Anyone who can reach the API can send `x-food-tracker-profile: sarah` and read or write Sarah's data. Cloudflare Access presumably gates the site, but the profile is chosen client-side with no integrity check.

### 3. Default Profile Fallback Silently Writes to Chris

In `app/api/profile.ts:6`, if the header is missing or unrecognized, the default is `"chris"` rather than rejecting the request. A missing header silently writes to Chris's data instead of returning an error.

---

## High-Priority Issues

### 4. `food-tracker.tsx` is a 2,629-Line God File

This single file contains ~30 component definitions plus helper functions. Natural module boundaries exist for diary, calendar, reports, weight, journal, foods, settings, exercise, water, and profile. This is the single highest-impact maintainability concern.

Components that should be extracted into separate files:

| Component | Lines | Domain |
|---|---|---|
| `FoodTracker` | 127-545 | App shell |
| `StepsCard` | 555-607 | Steps |
| `MyFoodsPage` | 609-676 | My Foods |
| `FoodHistoryList` | 688-793 | My Foods |
| `ConfirmDeleteFood` | 799-823 | My Foods |
| `CalendarPage` | 867-939 | Calendar |
| `DayDetail` | 942-983 | Calendar |
| `ReportsPage` | 985-1098 | Reports |
| `SevenDayNutritionTrend` | 1116-1187 | Reports |
| `NutritionAveragesTable` | 1202-1244 | Reports |
| `WeightPage` | 1250-1342 | Weight |
| `JournalPage` | 1378-1480 | Journal |
| `AddFood` | 2032-2278 | Add Food |
| `AddExercise` | 2495-2586 | Exercise |
| `EditExercise` | 2596-2629 | Exercise |
| `SettingsEditor` | 2303-2408 | Settings |
| `BarcodeScanner` | 1903-1996 | Barcode |
| `SavedFoodPicker` | 1848-1895 | Saved Foods |

### 5. `roundTwo` is Duplicated in 9 Files

The function `const roundTwo = (value: number) => Math.round(value * 100) / 100;` appears identically in:

- `app/nutrition.ts:58`
- `app/export-summary.ts:26`
- `app/day-recap.ts:40`
- `app/api/entries/route.ts:13`
- `app/api/estimate-activity/route.ts:125`
- `app/api/workouts/store.ts:21` (exported)

Additionally, two variants accept `unknown` instead of `number`:

- `app/api/export/route.ts:30`
- `app/api/calendar/route.ts:14`
- `app/api/reports/route.ts:12`

This should be a single shared utility in `app/shared.ts`.

### 6. `isDate` is Duplicated in 7 Files

The regex `const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);` is copy-pasted into 7 API route files with minor variations (some add a `Date.parse` check, some add a `typeof` check). This should be a shared utility.

### 7. No Rate Limiting on Any Endpoint

No rate limiting exists on any API endpoint. The Gemini-backed endpoints (`/api/estimate`, `/api/estimate-activity`) could be abused to run up API costs. This is partially mitigated by Cloudflare Access, but adding rate limiting is still recommended.

### 8. No `React.memo` Anywhere

Not a single component in `food-tracker.tsx` or `workouts.tsx` uses `React.memo`. The root `FoodTracker` component holds ~15 `useState` hooks. Any state change triggers a full re-render of the entire application tree. The most impactful place to add memoization would be on the page-level components (`CalendarPage`, `ReportsPage`, `WeightPage`, `JournalPage`) since they are expensive to render and their data does not change when unrelated state changes.

---

## Medium-Priority Issues

### 9. Duplicated Modal Pattern (11 Occurrences)

Every modal in the codebase repeats this exact structure:

```tsx
<div className="modal-backdrop" onMouseDown={onClose}>
  <div className="modal compact" onMouseDown={e => e.stopPropagation()}
    role="dialog" aria-modal="true" ...>
    <div className="modal-head">...</div>
    ...
  </div>
</div>
```

This is a prime candidate for a `<Modal>` wrapper component that handles backdrop click, Escape key, and focus management.

### 10. Escape Key Inconsistency

Only 2 of 11 modals (`CarbBreakdownDialog`, `FatBreakdownDialog`) handle the Escape key. All other modals can only be closed by clicking the backdrop or the X button. This is a keyboard accessibility gap.

### 11. Duplicated Fetch Header Memoization (13 Occurrences)

Every component that calls an API writes:

```tsx
const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
```

This appears 8 times in `food-tracker.tsx` and 5 times in `workouts.tsx`. This should be a shared hook like `useProfileHeaders(profile)`.

### 12. No `<ErrorBoundary>` in `layout.tsx`

If any child component throws during render, the entire page goes white. An error boundary around the client-side app shell would prevent this.

### 13. PDF Drawing Helpers are Duplicated Between Two Files

`app/export-pdf.ts` and `app/export-summary-pdf.ts` each define their own copies of:

- `pdfSafe()` -- identical character-by-character
- `fit()`, `font()`, `ensure()`, `table()`, `paragraph()` -- structurally identical with minor size differences
- Color constants (`INK`, `MUTED`, `RULE`, `HEADER_FILL`, `ZEBRA_FILL`/`CARD_FILL`)

A shared `pdf-utils.ts` module would eliminate ~150-200 lines of duplication.

### 14. `ZEBRA_FILL` vs `CARD_FILL` Naming Inconsistency

The detailed PDF calls its row-stripe color `ZEBRA_FILL`, the summary PDF calls it `CARD_FILL`, but they are the same RGB value `[248, 250, 247]`. This inconsistency could confuse a future maintainer.

### 15. Missing `aria-labelledby` on Some Modals

`DayDetail` (line 957), `EditWeight` (line 1357), `CustomWater` (line 2412), `SettingsEditor` (line 2375), and `EditSavedFood` (line 1517) do not have `aria-labelledby` linking the dialog to its heading.

### 16. Compressed Single-Line Components

Several components are compressed onto single lines, making them nearly impossible to review or modify:

- `EditSavedFood` (line 1517) -- ~800 characters on one line
- `CustomWater` (line 2410) -- entire component on one line
- `ProfileChooser` (line 1656) -- entire component on one line

### 17. No Tests for 8 API Routes

The following API routes have zero test coverage:

- `app/api/water/route.ts`
- `app/api/steps/route.ts`
- `app/api/weight/route.ts`
- `app/api/journal/route.ts`
- `app/api/calendar/route.ts`
- `app/api/food-history/route.ts`
- `app/api/estimate-activity/route.ts`
- `app/api/profile.ts`

### 18. No UI Component Tests

All `.tsx` files are untested. There are no component-level tests for any React component.

### 19. Dead Code: `chatgpt-auth.ts`

`app/chatgpt-auth.ts` is not imported by anything in the codebase. It appears to be scaffolding for a future ChatGPT platform integration that was never completed.

### 20. Dead Configuration: `wrangler.local.jsonc`

This file is not referenced by any code or script. The `vite.config.ts` builds its own `localBindingConfig` inline. This appears to be a leftover from when `wrangler dev` was used directly.

---

## Low-Priority Issues

### 21. Stale Next.js References in `.gitignore`

Lines 16-18 ignore `/.next/`, `/out/`, and `next-env.d.ts`. These are irrelevant after the migration from Next.js to vinext/Cloudflare. They are harmless but indicate the gitignore was never cleaned up.

### 22. Empty `next.config.ts`

`next.config.ts` is an empty default config. Since the project uses vinext/Cloudflare rather than Next.js at runtime, this file may be unnecessary.

### 23. `eslint.config.mjs` Extends `eslint-config-next`

The ESLint config extends `eslint-config-next`, which is the Next.js ESLint config. Since this project has migrated to vinext, some Next.js-specific rules may produce false positives or be irrelevant.

### 24. Inconsistent `isDate` Implementations

Some files add a `Date.parse` check, some add a `typeof` check, and some use only the regex. The `reports` and `export` routes add `!Number.isNaN(Date.parse(...))` while others do not. This means some routes accept invalid dates like `2024-02-30`.

### 25. `build-verified.sh` Does Not Verify

The script name implies verification, but it only runs the build with a timeout. There is no post-build check (e.g., verifying that `dist/` contains expected files, or running a smoke test). The "verification" is the timeout itself -- a build that hangs is killed.

### 26. `workout-program.test.mjs` is a 681-Line Monolith

This single test file tests an enormous surface area. It would benefit from being split into focused sub-files (e.g., import, cycles, sessions, sets, history, profile isolation).

### 27. `usda-removed.test.mjs` Scans the Entire Source Tree

Lines 15-24 recursively walk every `.ts/.tsx/.css` file in the project looking for USDA references. This is slow and brittle -- adding a test utility file or fixture that mentions "USDA" in a comment would cause a false failure.

### 28. Migration 0011 is a 296-Line Single Migration

This single migration creates 9 tables with numerous indexes and CHECK constraints. If any part fails, the entire migration fails. Consider whether this should be split into smaller, independently verifiable migrations.

### 29. Migration 0000 Uses Backtick Quoting

The initial migration uses backtick-quoted identifiers (e.g., `` `food_entries` ``), while later migrations do not. SQLite does not require backtick quoting (it is MySQL style). This is not a functional issue but is an inconsistency.

### 30. Migration 0012 Has Statement-Breakpoint on Same Line as ALTER TABLE

Lines 16-17 concatenate `ALTER TABLE` and `--> statement-breakpoint` on one line. This is syntactically valid because SQLite treats `-->` as a comment, but it is inconsistent with every other migration where breakpoints are on their own lines.

### 31. No Rollback Migrations

All migrations are forward-only with no rollback support. This is typical for SQLite/D1 projects but means any mistake requires manual intervention.

### 32. `.openai/hosting.json` Project ID Committed to Source

The `project_id` is a real Cloudflare project identifier committed to source. While not a secret per se, it ties the codebase to a specific deployment. If the project is cloned or forked, this ID will be wrong.

### 33. Error Messages May Leak Internal Details

In some catch blocks, `error.message` is returned directly to the client. If a Drizzle or D1 error occurs, its message could contain SQL, table names, or D1 internals.

### 34. `DELETE` Operations Use Query Parameters

Delete operations use `GET`-style query params (`?id=123`). This means delete URLs can appear in browser history, server logs, and referrer headers.

### 35. No Content-Type Enforcement on JSON Routes

Routes that accept JSON implicitly rely on the runtime to reject non-JSON bodies. There is no explicit `Content-Type` check. In practice, `request.json()` throws on non-JSON, which the `catch` block handles, but explicit checks would be more defensive.

---

## Code Quality Observations

### 36. `CarbTotals.sugarAlcohols` is Always `null`

The type carries a field that can never be anything but null. The comment explains why (sugar alcohols are not tracked), but this adds cognitive overhead. This is intentionally forward-looking.

### 37. `diary-actions.ts` is Only Imported by One File

Both `diary-actions.ts` and `day-recap.ts` are imported only by `food-tracker.tsx`. Their value is in testability and separation of concerns, which is only realized if tests actually exist for them.

### 38. `PREFERRED_CALORIE_RANGE` is User-Specific

In `app/day-recap.ts`, the constant `{ min: 2000, max: 2100 }` is labeled as "what Chris aims for" but is not profile-aware. If Sarah has a different preferred range, this would need refactoring.

### 39. `nextMonday` Uses UTC Parsing

In `app/workout-shared.ts:97`, `Date.parse` uses a `Z` suffix (UTC), which contradicts the codebase's stated UTC-avoidance policy. The subtraction is timezone-safe, but the pattern is inconsistent.

### 40. No Optimistic UI Updates

All mutations wait for the server response before updating state. The workouts module's `SetRow` component saves on blur, which is good, but does not show pending state per-field.

### 41. No Skeleton/Loading States

Loading states are plain text ("Loading the calendar...", "Loading your program..."). There are no skeleton placeholders or shimmer effects.

### 42. No Toast/Snackbar System

Success states use inline `aria-live="polite"` text. Errors use `<p className="form-error">`. There is no transient notification system -- the workout "Saved" indicator (line 524) fades via a timer, but this is the only one.

### 43. No Route-Based Code Splitting

Everything is client-side rendered from `food-tracker.tsx`. There are no Next.js page routes or dynamic `import()` for heavy features. The barcode scanner does dynamically import `@zxing/browser`, which is good.

### 44. Inline Functions in Render

Many event handlers are created inline (e.g., `onClick={() => setMonth(shiftMonth(month, -1))}`). These are not memoized with `useCallback`, causing child re-renders if the children were memoized. Since nothing is memoized currently, this is a latent issue that would surface if memoization were added.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 5 |
| Medium | 12 |
| Low | 15 |
| Observations | 9 |
| **Total** | **44** |

The codebase is well-designed with excellent documentation and consistent patterns. The main areas for improvement are:

1. **Split `food-tracker.tsx`** into domain-specific modules
2. **Extract shared utilities** (`roundTwo`, `isDate`, `useProfileHeaders`, `<Modal>`)
3. **Add tests** for untested API routes and UI components
4. **Standardize modal behavior** (Escape key, focus management, `aria-labelledby`)
5. **Add `React.memo`** to page-level components to prevent unnecessary re-renders
