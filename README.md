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
- Editable calorie and macro goals, with an optional saturated-fat goal and a
  live percentage beside each one as it is typed
- Calorie shares and goal percentages in Settings, Reports, and both PDF
  exports, kept strictly apart: a share of calories is never presented as a
  goal percentage, fiber is reported against its gram goal rather than as a
  share of calories, and net carbs are shown as a calorie-equivalent
- Per-profile water shortcut buttons plus a custom-ounce option
- Water and exercise tracking, with optional detailed comments on any
  activity
- Gemini activity assistant that turns a typed or dictated workout into
  activity segments and a calorie estimate calculated from body weight
- Manually entered daily step count, one total per person per day
- Workout programs with set-by-set strength tracking: a reusable program
  library seeded with VASA's published four-week plan, user-specific four-week
  cycles with explicit start dates, Start and Resume Workout, per-set reps,
  weight, and cardio recording, and one linked entry in the activity diary for
  each finished workout
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

The application has seven sections, selected from the navigation under the
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
- **Workouts** - the workout program dashboard, the gym screen, and workout
  history. See [Workout programs](#workout-programs) below.

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

## Workout programs

The Workouts section holds a reusable program library and the workouts
actually performed against it. It ships with VASA's published four-week
program: three workouts a week - functional/free weight, machines, and a
Studio Red class - across Weeks 1 to 4.

### The program, cycles, and weeks

A program is a reusable definition, shared by both profiles. A **cycle** is
one profile's scheduled run of that program, and it is the only thing that
gives the program dates. Importing or opening the program never starts a
cycle: a cycle exists only once Start Cycle is pressed and a start date is
confirmed. Weeks run Monday to Sunday from that date.

There is no Week 5. After Week 4 the dashboard offers **Start new cycle**,
which proposes the next cycle number and the Monday after the previous cycle
ends, shows the four new week ranges, and lists every workout still unfinished
in the previous cycle before anything is created. Cycle 2 begins with fresh
statuses for Weeks 1 to 4; Cycle 1 keeps every session, status, weight, and
note it already held. Two cycles of one program are not allowed to overlap
unless the overlap is explicitly confirmed.

Dates only ever *recommend* a week. Any workout in any week can be started
early, finished late, or done out of order, and an unfinished workout stays
available indefinitely. A Week 1 workout finished during Week 2 is still
recorded as that cycle's Week 1, Workout n, with the date it was actually
performed; it never counts toward another week or another cycle. Nothing is
marked completed, or reopened, because a date passed: a week's status is
worked out from its own workouts, and a cycle is only completed when it is
marked so by hand.

### Running a workout

Start Workout creates a session and freezes what the program prescribed at
that moment - names, descriptions, videos, sets, reps, and cardio targets -
onto the session itself. Editing the program, an exercise description, or a
video later therefore never rewrites history, and a past workout still reads
correctly if the template or exercise is deleted outright.

Only one session per workout can be in progress at a time; pressing Start
again offers Resume rather than creating a second. Prescribed working sets are
created up front, preloaded with the target reps and the weight used last
time, and nothing counts as done until its tick is pressed. The gym screen
shows only the fields that apply: no reps on a stair climber, no distance on a
squat, and no weight on a body-weight exercise. Every change is saved as it is
made.

Finishing is always a separate step, offering **Completed** or **Partial**,
with the duration, optional calories burned, optional difficulty, and notes.

### The activity diary

Finishing a workout writes exactly one ordinary entry in the daily activity
diary, named for example `Strength Training - VASA, Cycle 1, Week 1,
Workout 1`, carrying the duration, the calories entered, and a concise summary
of the exercises and sets. The session remembers that entry, so finishing
again, correcting the duration, or switching between Completed and Partial
updates the same row rather than adding a second. Reports, the Calendar, and
the exports read the diary as they always have, so a workout is counted once.
Abandoning a workout removes its diary entry. Exercise calories stay
informational and never change the food-calorie allowance.

### Previous performance

Each exercise shows the most recent completed performance, the machine or
equipment settings recorded with it, and the heaviest completed working set
ever recorded. That history is never limited to the current cycle, so Cycle 2
still shows what was lifted in Cycle 1. Workout volume is the sum of
`reps x weight` over completed working sets only.

### The VASA source data

`db/seed/vasa-4-week-fitness-program.md` holds the extracted source table, and
`app/api/workouts/vasa-program.ts` holds it normalized into the shape the
database stores, together with the list of corrections that were made. The
import is idempotent: running it again updates in place and never duplicates
the program, its weeks, its workouts, the exercise library, or a cycle.

Corrections were limited to clear copy-and-paste mistakes in VASA's published
table. The Week 1 incline-treadmill row repeats the lat-pulldown description
and is seeded with no description rather than a wrong one; the Week 2 and
Week 4 Box-Elevated Push-Up rows repeat a dumbbell-row description and use the
published push-up text instead. Genuinely blank cells - the Week 3
incline-treadmill targets and the Week 4 lat-pulldown sets and reps - stay
empty rather than being invented. `KB` and `DB` are expanded to Kettlebell and
Dumbbell so one movement is one exercise, while each workout keeps its own
prescribed sets and reps.

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

The workout tables added in `0011_workout_programs.sql` keep the reusable
program (`exercise_library`, `workout_programs`, `workout_program_weeks`,
`workout_templates`, `workout_template_exercises`) apart from one profile's own
records (`workout_program_cycles`, `workout_sessions`,
`workout_session_exercises`, `workout_sets`). The reusable rows carry a null
owner and are shared; everything personal carries the profile and is scoped by
it on every read and write. The `_snapshot` columns on a session are what its
history displays, which is why a past workout survives the program being edited
or deleted.

## Planned next phase

- Dedicated drinks/beverages category
- Chat-assisted daily recap that reads the day's food, water, movement, and
  weight and writes the Journal entry. `journal_entries.source` already
  records how an entry was written so assisted entries can be told apart.
- Weight trend chart and goal weight
- Nutrition-label photo scanning
- Workout programs beyond VASA, editable from the app rather than from a seed
  file, and a progression engine that suggests the next weight

Do not place private AI or other API keys directly in source files. Keys belong
in `.dev.vars` locally and in Cloudflare secrets in production.
