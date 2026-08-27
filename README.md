# Daily Food Tracker

Mobile-first food diary for recording meals and tracking calories, protein,
fat, saturated fat, trans fat, monounsaturated fat, polyunsaturated fat,
total carbohydrates, fiber, and net carbohydrates.

## Current features

- Separate breakfast, lunch, dinner, and snack entries
- Manual nutrition-label entry
- Saved custom foods, chosen from a searchable type-ahead list on the
  Add Food form
- Barcode scanning with product lookup from Open Food Facts, plus manual
  barcode entry when a camera is unavailable
- Gemini meal assistant that estimates nutrition from a typed or dictated
  meal description
- Fat breakdown: saturated, trans, monounsaturated, and polyunsaturated fat
  alongside total fat, each optional and stored in grams. A value that was
  never recorded stays unknown and is shown as "Not available", never as 0 g.
  Tapping the Fat card on the diary opens the day's breakdown.
- Fractional servings that scale the recorded nutrition
- Editable calorie and macro goals
- Per-profile water shortcut buttons plus a custom-ounce option
- Water and exercise tracking, with optional detailed comments on any
  activity
- Gemini activity assistant that turns a typed or dictated workout into
  activity segments and a calorie estimate calculated from body weight
- Manually entered daily step count, one total per person per day
- Weekly Reports page for calories consumed and recorded movement
- Calendar page colouring each day against the calorie goal that applied on
  that day
- Weight log holding one reading per day, with an optional note and the
  change from the previous reading, plus a weight-history chart with one,
  three, six month, and all-time ranges
- Daily journal holding one written entry per day
- Export centre on the Weight, Journal, and Reports pages producing a
  printable PDF or a structured JSON file for a chosen date range, plus a
  concise one-page summary PDF for a doctor from the Reports page
- Automatic net-carb calculation
- Date-by-date history
- Per-user data ownership when authenticated user headers are available
- Installable iPhone Home Screen experience
- Cloudflare D1 storage with Drizzle migrations

## Sections

Tapping the Nourish logo and title in the header reloads the page, for when
Safari keeps showing a stale view of something just saved. It stays on the
same address and works from the keyboard.

The application has six sections, selected from the navigation under the
header:

- **Diary** - the day's meals, macros, water, exercise, and steps. Steps are
  entered by hand as a whole number, one total per day, and can be corrected
  or removed.
- **My Foods** - editing and deleting reusable saved foods. Editing or
  deleting a saved food never changes diary entries that were already
  recorded; each entry keeps its own nutrition snapshot. Deleting asks for
  confirmation, names the food, and frees any barcode it held.
- **Calendar** - a month at a glance. Each day is coloured by how its
  calories compared with that day's goal, and lists that day's calories,
  exercise minutes, and steps, with a dot showing whether any movement was
  recorded.
- **Reports** - calories, movement, and steps recorded over a date range,
  followed by a movement log listing each recorded activity with its
  comments.
  The Last 7, 14, and 30 day presets cover completed days only, ending
  yesterday, so a day still in progress never drags the averages down. The
  range defaults to the last seven completed days, and a custom start and end
  date can be chosen, which may include today. Dates with no entries are listed
  with zero values; a date with no step entry shows a dash rather than a
  zero, so "not recorded" never reads as a zero-step day. This page also
  carries the complete export.
- **Weight** - the weight log. A reading is entered in pounds against a date,
  with an optional note. Each date holds one reading, so re-weighing on a
  date corrects it rather than adding a second row, and every entry can be
  edited or removed. Readings are listed newest first with the change from
  the previous reading. A chart above the log plots the recorded readings by
  date over one, three, or six months, or all of them, defaulting to three
  months, and reports the starting weight, the latest weight, and the change
  across the chosen period. Only real weigh-ins are plotted; days without a
  reading are left out rather than filled in.
- **Journal** - one written entry per day for how the day went. The day is
  chosen with the same date strip as the Diary, and earlier entries are
  listed below for jumping back. Entries are written by hand today; the
  planned chat recap will write them later.

### Exporting

Each of the Weight, Journal, and Reports pages carries an export panel built
from one shared component, so every export comes from the same data. The
Weight page exports weight readings, the Journal page exports written
entries, and the Reports page exports everything.

Choose a start date, an end date, and which sections to include. The
presets - 7 days, 30 days, 3 months, 6 months, This year, and All recorded -
all end on the last completed day, yesterday, and so does the range the panel
opens with. Today is still in progress, so it is left out of anything a
button picks; a start and end typed in by hand may still include today. Every
section offered on a page starts ticked and can be turned off on its own.
The available sections are weight entries, journal entries, daily nutrition
totals, individual food entries, water, exercise and movement, exercise
calories, steps, and nutrition goals, including the calorie goal that was
frozen onto each day in the range.

Three formats are produced entirely in the browser:

- **PDF** - a printable document with the name, the date range, the creation
  date, each chosen section under its own heading, tables that repeat their
  header when they run onto a new page, and a page number on every page.
- **JSON** - a structured file for uploading into an analysis tool, plus a
  Copy JSON button. Fields are named plainly, dates are ISO calendar dates,
  and nutrition values stay as numbers rather than formatted strings. No
  database ids, keys, or another profile's data are ever included.
- **Summary PDF** - offered on the Reports page only. See below.

Files are named after the profile and the range, for example
`chris-health-export-2026-08-01-to-2026-08-31.pdf`.

An export only ever contains the currently selected profile's data. The
start date must not be after the end date, at least one section must be
chosen, and a range holding nothing shows a plain message instead of
producing an empty file.

### The summary PDF

The Reports page carries a fourth button, **Download Summary PDF**, beside
the three above. It uses the same profile, date range, and section
checkboxes, and it is a separate document: the detailed PDF and the JSON are
unchanged by it. Where the detailed PDF lists every row, the summary lists
none of them. It gives headline figures a doctor can read in a minute -
weight progress with a small trend chart, nutrition averages against the
current goals, hydration, exercise, steps, journal participation, and a data
coverage block - and it fits on one page in normal use, running onto a second
only rather than shrinking the type. It is named
`chris-health-summary-2026-07-26-to-2026-08-24.pdf`.

**Averages cover recorded days only.** Each category counts its own recorded
days and a missing date is never treated as a zero:

- A **nutrition day** is a date holding at least one food diary entry.
  Calories, protein, total carbs, fiber, net carbs, and fat are all divided
  by that count. A thirty-day range holding four days of food reports
  "Average calories: 1,963 across 4 recorded nutrition days", never
  the same total divided by thirty.
- A **hydration day** is a date holding at least one water entry. A date with
  no water entry is unknown, not zero ounces.
- A **step day** is a date holding a step record. A count saved as `0` is a
  genuine recorded day and is counted; a date with no record at all is not.
- An **exercise day** is a date holding at least one activity. Dates without
  one are not treated as confirmed rest days. Exercise calories are reported
  on their own and are never added to, or subtracted from, calories eaten.
- **Weight** is event based rather than averaged: the earliest and latest
  readings inside the range, both dates, the total change, and a weekly rate
  once those two readings are at least a week apart. One reading or none is
  said plainly instead of being shown as no change.

Turning a section off omits that part of the summary rather than printing an
empty heading, and turning off nutrition goals drops the goal column instead
of leaving it blank. Nutrition goals on their own leave nothing to average,
so the button is disabled until another section is ticked.

Goals and the three water shortcut amounts are edited from the gear icon and
are stored separately for each profile.

## Calendar and per-day calorie goals

The Calendar page shows one month at a time. Each day's background says how
that day's calories compared with the goal that applied **on that day**:

- green - at or under the goal
- yellow - over the goal
- red - over the goal by more than 500 calories
- neutral grey - nothing logged that day

Under the day number, a day with anything recorded lists its totals: calories
eaten, exercise minutes, and steps, such as `1,982 Cal`, `95 min`, and
`8,101 steps`. Minutes are added up across every session recorded that day;
steps are the single daily total, so they are never counted twice. A day with
nothing recorded shows only its number.

A dot in each day shows movement: green when exercise was recorded, grey when
none was. Tapping a day shows the calories, the goal that applied, how far
over or under it was, and the movement recorded, with buttons to correct that
day's goal or open the day in the Diary.

### Why the goal is stored per day

The calorie goal is expected to drop as weight comes off, and lowering it
should not make earlier days look worse than they were. So the goal is
snapshotted:

- The first time anything is recorded for a day - food, exercise, or water -
  the calorie goal in force at that moment is frozen onto that day.
- Later entries on the same day do **not** re-stamp it.
- Changing the goal in Settings updates **today only**, so the Diary ring and
  the Calendar agree about the day in progress. Earlier days never move.
- Any day's stored goal can be corrected by hand from the Calendar, for when
  a value was recorded wrongly.

Days recorded before this feature existed have no stored goal. They fall back
to the current setting and are labelled "current setting" until a goal is
pinned to them.

Stamps are per profile, so Chris and Sarah keep separate goal histories.

## Meal assistant

The Add Food form has a **Describe your meal** text area and an **Estimate
Nutrition** button. Type the meal, or tap the microphone key on the iPhone
keyboard and dictate it - the application does not record audio or use the
microphone itself, it only reads the text the keyboard produces.

The description is sent to `/api/estimate`, which calls Google Gemini on the
server and returns one estimate covering the whole description as a single
serving. The result pre-fills the food name, serving, and nutrition fields
for review. Nothing is saved until the entry is confirmed.

The estimate is labeled as an estimate. It is not exact, not medically
verified, and not medical advice. Assumptions, confidence, and warnings are
shown alongside the numbers so they can be checked and edited. A packaged
food label or a barcode scan is more accurate whenever one is available.

Unlike the other ways of adding food, an AI-estimated meal is **not** saved
to My Foods unless the "Save to My Foods" checkbox is ticked. When it is
ticked, My Foods stores the full one-serving values, not the amount scaled by
"Servings eaten".

If Gemini cannot produce a usable estimate, the application says what is
missing and keeps the description so it can be corrected. If Gemini is
unavailable, slow, rate limited, or not configured, the rest of the Add Food
form keeps working normally.

## Activity assistant

The Add Exercise form takes a typed or dictated description of a workout,
such as "gym from 6:03 to 6:38, treadmill warmup 10 minutes, squats 4 sets of
8, treadmill cooldown 8 minutes". Dictation uses the microphone on the iPhone
keyboard; the application never asks for microphone access itself.

The description is sent to `/api/estimate-activity`. Gemini splits it into
activity segments and proposes a duration and a standard MET value for each
one. It separates total elapsed time from active exercise time, keeps warmup,
lifting, rest, and cooldown apart, and never counts the same minutes twice.
The total minutes always equal the sum of the segments.

Gemini never supplies the calorie total. Calories are calculated on the
server for each segment with the standard formula:

```text
calories = MET x 3.5 x body weight in kg / 200 x minutes
```

The body weight is the selected profile's most recent weight entry on or
before the activity date, falling back to their earliest recorded reading if
the log started later. Chris's weight is never used for Sarah, or the other
way round. If no weight has been recorded at all, the assistant asks for one
before estimating. The weight used is shown with the estimate, for example
"Estimated using a body weight of 294 lb". No copy of the weight is stored
with the activity; the calorie figure saved on the entry is the historical
value, so a later weigh-in never rewrites past activities.

The proposal fills the activity name, minutes, calories, and comments in the
normal form for review. Nothing is saved until Add exercise is tapped, and
every field can be edited first. The estimate can be dismissed, and the whole
form keeps working when Gemini is unavailable, slow, rate limited, or not
configured.

### Activity comments

Any activity can carry optional detailed comments of up to 2,000 characters,
validated in the browser and again on the server. Comments are shown under
the activity in the Diary, clamped to two lines with a Show more control so
one long note never swallows the daily summary. They appear in the copied
daily recap, the Reports movement log, the PDF export under an "Activity
notes" heading, and the JSON export as their own `comments` field. Activities
recorded before comments existed stay valid with an empty comment.

### Gemini setup

The assistant needs a `GEMINI_API_KEY` from Google AI Studio on the free
Gemini Developer API tier. The key is read only from the Worker environment
and is never sent to the browser.

For local development, copy the example file and put your own key in it:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

`.dev.vars` is ignored by Git. Restart the dev server after changing it.

For production, store the key as a Cloudflare secret. This is a one-time
setup step and is not part of a normal code push:

```powershell
npx wrangler secret put GEMINI_API_KEY --name food-tracker
```

The model is `gemini-3.1-flash-lite`. Setting a `GEMINI_MODEL` environment
value overrides it, and the route falls back to `gemini-2.5-flash-lite` if
the configured model name is rejected.

## Barcode scanning

The Add Food form has a **Scan barcode** button. The camera preview uses
ZXing (`@zxing/browser`), not the experimental native `BarcodeDetector` API,
because Safari on iPhone does not provide it. The rear camera is requested
when one is available, and the camera is stopped and released as soon as a
code is read or the scanner is closed. A barcode can always be typed in by
hand instead, which is the fallback when camera access is denied.

Camera access requires a secure context. It works on the live HTTPS site and
on `http://localhost` during development, but not over plain HTTP to a LAN
address.

The scanned code is sent to `/api/barcode`, which queries Open Food Facts on
the server so the upstream request stays out of the browser. Nutrition is
taken from the labeled serving when the product has one. When a product only
carries per-100-gram values, the form is filled on that basis and clearly
says so rather than treating 100 g as one serving. Missing values are left
blank and named on screen; nothing is invented. A found product only
pre-fills the form - the diary entry is saved when you confirm it.

### Open Food Facts attribution

Product data comes from [Open Food Facts](https://world.openfoodfacts.org)
and is made available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The lookup sends an identifying User-Agent as Open Food Facts asks. It is a
free, open service: no key, account, or payment is involved.

## Technology

- TypeScript
- React 19
- ZXing (`@zxing/browser`) for in-browser barcode decoding
- Vinext/Next-compatible application routes
- Cloudflare Workers and D1
- Drizzle ORM
- Open Food Facts product API
- Google Gemini Developer API (`gemini-3.1-flash-lite`)

## Open on a Windows computer

The hosted application is already deployed. This source package is for keeping
and editing your own copy.

1. Extract the ZIP into a normal project directory.
2. Open the extracted folder in Visual Studio Code.
3. Use WSL with Node.js 22.13 or newer for the included project scripts.
4. In the WSL terminal, run:

   ```bash
   npm ci
   npm run dev
   ```

The production database is supplied by the hosting platform. Local development
uses the binding behavior configured in `vite.config.ts`.

## Database

The schema is in `db/schema.ts`. Generated SQL migrations are in `drizzle/`.
The `daily_goals` table holds one calorie goal per owner per day, which is
what the Calendar grades against. The `weight_entries` and `journal_entries`
tables each hold at most one row per owner per day, enforced by a unique index
on the owner and the date.
Food entries are assigned to the authenticated user's email, so two authenticated
people receive separate diaries.

## Planned next phase

- Dedicated drinks/beverages category
- Chat-assisted daily recap that reads the day's food, water, movement, and
  weight and writes the Journal entry. `journal_entries.source` already
  records how an entry was written so assisted entries can be told apart.
- Weight trend chart and goal weight
- Nutrition-label photo scanning

Do not place private AI or other API keys directly in source files. Keys belong
in `.dev.vars` locally and in Cloudflare secrets in production.
