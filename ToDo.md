| Original request                            | Status   | What exists now                                                                                                                                                |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser-based site instead of an iPhone app | Complete | Runs as a website and can be opened from an iPhone browser.                                                                                                    |
| No Python server                            | Complete | Uses React/Vinext with Cloudflare Workers and D1.                                                                                                              |
| Free hosting and services                   | Complete | Cloudflare Workers, D1, Zero Trust Free, Open Food Facts, and the Gemini free tier are being used at $0 per month.                                             |
| No monthly hosting charge                   | Complete | The current services are on free plans. Cloudflare Zero Trust required a payment method but currently costs $0 per month.                                      |
| Daily food diary                            | Complete | Food can be entered under Breakfast, Lunch, Dinner, and Snacks.                                                                                                |
| Nutrition details automatically supplied    | Partial  | Barcode scanning and the Gemini meal assistant supply calories, protein, total fat, the four fat subtypes, carbs, and fiber. Packaged products use their label serving when Open Food Facts has one. |
| AI-assisted food entry                      | Complete | The Add Food form takes a typed or dictated meal description and asks Google Gemini for a nutrition estimate, which is reviewed and edited before it is added. |
| Manually enter foods                        | Complete | You can enter all nutrition values yourself.                                                                                                                   |
| Remember custom foods                       | Complete | Manually entered foods can be saved under “My Foods” and reused. The Add Food form filters them with a searchable type-ahead list.                             |
| Daily calorie tracking                      | Complete | Main screen shows consumed calories, goal, remaining calories, and over-goal status. The Calendar scores each day against the goal saved for that day.         |
| Net-carbohydrate tracking                   | Complete | Calculated as total carbohydrates minus fiber, food by food. The diary's carbohydrate card shows total carbs and net carbs side by side, and tapping it opens the breakdown. The goal is a minimum and a maximum, so being under the minimum is reported as under the minimum rather than as success. |
| Protein and fat tracking                    | Complete | Both appear in daily progress totals. Tapping the Fat card opens the day's saturated, trans, monounsaturated, and polyunsaturated breakdown; a subtype nothing recorded reads "Not available", never 0 g. |
| Fiber tracking                              | Complete | Fiber is stored with food entries and shown on the main screen with a customizable daily goal.                                                                 |
| Multiple people—Chris and Sarah             | Complete | Each profile has separate food, goals, water, and saved foods.                                                                                                 |
| Lightweight security                        | Complete | Cloudflare Access permits only Chris’s and Sarah’s authorized email addresses.                                                                                 |
| Water tracking                              | Complete | Separate water section with three shortcut buttons plus `+Other`. Each profile sets its own shortcut amounts in Settings, defaulting to 6, 8, and 12 ounces.   |
| Drinks other than water                     | Partial  | Drinks containing calories can be entered as food, but there is no dedicated “Drinks” meal/category.                                                           |
| Structured workout program tracking         | Complete | The Workouts section holds VASA's four-week program, user-specific four-week cycles with explicit start dates, Start/Resume Workout, set-by-set tracking, workout history, and one linked entry per finished workout in the activity diary. |
| Exercise tracking on the main screen        | Complete | Tracks activity, minutes, optional calories burned, optional detailed comments, daily history, and separate Chris/Sarah records. A described workout can be estimated by Gemini and reviewed before saving.                                                           |
| Put the site online                         | Complete | The application and D1 database are live on Cloudflare Workers.                                                                                                |
| Restrict the live site to Chris and Sarah   | Complete | Cloudflare Access requires an email login code and allows only the two authorized email addresses.                                                             |

- Add in ability to track weight loss

- Calendar: a month grid colours each day against the calorie goal that was
  saved for that day - green under, yellow over, red more than 500 over, grey
  when nothing was logged - with a dot for whether movement was tracked. The
  calorie goal is frozen onto a day the first time anything is recorded for
  it, so lowering the goal later never changes how past days are scored. Any
  day's goal can be corrected by hand.

- Meal assistant: the Add Food form takes a typed or dictated meal
  description and returns a Gemini nutrition estimate for the whole meal as
  one serving, with assumptions, confidence, and warnings shown for review.
  It is added to the diary only, unless "Save to My Foods" is ticked.

- Barcode scanning: the Add Food form can scan a UPC/EAN with the camera or
  take a typed barcode, then look the product up through Open Food Facts and
  pre-fill the form for review. Products that are missing, incomplete, or
  only carry per-100-gram values are handled explicitly, and scanned products
  can be saved to My Foods with their barcode.

- Weight log: a Weight section records one weight per day in pounds with an
  optional note, listed newest first with the change from the previous
  reading. Entries can be corrected or removed, and Chris's and Sarah's logs
  are separate. A chart above the log plots the recorded readings by date
  over 1, 3, or 6 months or all of them, defaulting to 3 months, and shows
  the starting weight, the latest weight, and the change across the chosen
  period. Days without a weigh-in are left out rather than filled in. No
  goal weight yet.

- Daily journal: a Journal section holds one written entry per day, chosen
  with the same date strip as the Diary, with earlier entries listed below.
  Entries are written by hand for now. The chat recap that writes them
  automatically is still to come.

- Reports: a Reports section now shows calories consumed, recorded movement,
  and steps for a chosen date range, defaulting to the last seven completed
  calendar days ending yesterday. The presets cover completed days only; a
  custom range may include today. It lists every date in the range, including days with
  no entries, and keeps Chris's and Sarah's data separate.

- Steps: the Diary records one manually entered step total per person per
  day. Only whole, non-negative numbers are accepted, the value can be
  edited or removed, and it appears in the day's copied summary, in Reports,
  and in exports.

- Export centre: the Weight, Journal, and Reports pages each carry an export
  panel built from one shared component. A start date, an end date, and the
  sections to include are chosen; every section offered starts ticked and can
  be turned off on its own. Both a printable PDF and a structured JSON file
  are produced in the browser, with a Copy JSON button beside them. Only the
  selected profile's data is included, and no database ids or keys ever
  appear in the output.

- Summary export: the Reports page adds a fourth button, Download Summary
  PDF, that turns the same range and the same section choices into a concise
  one-page document for a doctor rather than a list of every record. Each
  category is averaged across its own recorded days - a date holding food,
  water, an activity, or a step record - so a thirty-day range holding four
  days of food reports the average calories across those four days and never
  divides by thirty. A step count saved as zero counts as a recorded day; a
  missing date does not. Weight is reported as the first and last reading in
  the range with the change and a weekly rate. It is built in the browser
  with the same jsPDF dependency and needs no AI or paid service.

- Activity assistant: the Add Exercise form takes a typed or dictated
  workout description and returns Gemini-identified activity segments, with
  calories calculated on the server from the standard MET formula and the
  profile's own most recent weight. The proposal fills the activity form for
  review and is never saved automatically. Every activity can also carry
  detailed comments, which appear in the diary, the copied recap, Reports,
  and both exports.

- My Foods: saved foods can be deleted as well as edited. Deleting asks for
  confirmation by name, leaves historical diary entries untouched, and frees
  the barcode for reuse.

Future Ideas:
Daily diary memo: One editable memo per user per date. It should not affect nutrition totals.
Recap screenshot view: A clean, phone-sized summary card showing calories, net carbs, protein, fat, fiber, water, exercise minutes/calories, activity, weight if recorded, and date.
Weekly weight log: Record date and weight, with an optional note. Weigh under similar conditions—same day, morning, after using the bathroom, before eating.
Weight trend: Done. The Weight page shows the change since the last weigh-in per row and a chart with 1, 3, 6 month and all-time ranges reporting the change across the period.
Weekly summary: Seven-day averages for calories, protein, net carbs, fiber, water, and movement—not just totals. The seven-day nutrition trend table on Reports covers calories, total fat, total carbohydrates, and fiber; protein, water, and movement averages are still to come.
Monthly waist measurement: Optional, but helpful when weight temporarily stalls.
Milestones: Starting weight, current weight, total lost, next goal, and ultimate goal.
A1C history: Date and result whenever tested, since lowering it is one of your main goals.
Export: Done as PDF and JSON from the Weight, Journal, and Reports pages, plus a one-page doctor summary PDF from the Reports page. CSV is still an option if a spreadsheet is ever wanted.
Target snapshot: Keep the goals used for each day so later goal changes do not rewrite past reports.

The major unfinished pieces are:

1. Optionally add a dedicated Drinks category rather than entering caloric drinks as food.
2. Chat-assisted daily recap that reads the day and writes the Journal entry.
3. Goal weight and milestones on the Weight page.

Every item from the original vision is now in place. Food can be added by
hand, from a saved food, from a scanned barcode, or from an AI estimate of a
described meal. USDA food search was removed at Chris's request; it was not
being used.

- Nutrition percentages: Settings shows a live calorie share beside the net
  carb, protein, total fat, and saturated fat goals, recalculating as they are
  typed, and fiber stays a gram goal rather than a calorie share. The Reports
  screen, the detailed export PDF, and the doctor summary PDF all carry a
  Nutrition averages table built from one shared calculation, showing each
  metric's average per recorded day, its current goal, and either its share of
  average calories or how much of its goal was reached. The two kinds of
  percentage are always labelled apart. A saturated-fat goal is now an
  optional setting; there is still no total-carbohydrate goal, and total
  carbohydrates remain reported alongside net carbohydrates.

- Past-day warning: choosing Add Food or Add Exercise while an earlier day is
  on screen asks first, before any form opens, naming the day being viewed and
  today. Declining opens nothing, writes nothing, and returns the diary to
  today. Today is never questioned and a future date is deliberately left
  alone.

- Moving, copying, and saving one entry: the Edit Food screen carries an
  editable diary date that moves the entry - the same row is updated, so no
  copy is left behind - plus Copy to Today, which opens the ordinary Add Food
  form on today prefilled and editable without touching the original, and Add
  to My Foods, which saves a reusable food without altering the diary. The
  Edit Activity screen has the same editable date, with the same move-not-copy
  rule. Every one of them is scoped to the profile that owns the record.

- Net-carbohydrate goal range: the single net-carb goal became a minimum and a
  maximum, both editable in Settings. A minimum of 0 means no floor, which is
  how the single goal always behaved, and that is what every existing goal was
  migrated to. The minimum may not exceed the maximum, checked as it is typed
  and again on the server. The original `net_carbs` column is kept and written
  with the maximum, so every export, PDF, and older read path stays correct.

- Seven-day nutrition trend: the Reports page carries a plain HTML table of the
  seven completed days ending yesterday, with calories, total fat, total
  carbohydrates, and fiber per day and a grand total per column. Total
  carbohydrates, never net carbs. Unlike units are never added together.

- Fat breakdown: saturated, trans, monounsaturated, and polyunsaturated fat
  are stored in grams beside total fat on every diary entry and saved food.
  All four are optional and nullable: a value a label, product record, or
  estimate never gave stays unknown rather than becoming a zero, and the four
  are never forced to add up to total fat. They scale with servings, appear
  on the diary Fat card's popup, in Reports, in both PDFs, and in the copied
  daily summary. There is no goal for any subtype, by design.

- Workout programs: a Workouts section holds a reusable program library,
  seeded from VASA's published four-week plan, and the workouts actually
  performed against it. A program is reusable and shared; a cycle is one
  profile's scheduled run of it and exists only once it is started with a
  chosen start date. Chris's Cycle 1 runs Monday 31 August to Sunday 27
  September 2026. There is no Week 5: after Week 4 a new cycle is started
  deliberately, beginning again at Week 1, and previous cycles keep every
  session, weight, and note. Dates only recommend a week, so a workout can be
  started early, finished late, or done out of order and still belongs to its
  own cycle and week. Starting a workout snapshots what it prescribed, so
  editing the program later never rewrites history. Finishing a workout writes
  exactly one activity-diary entry and keeps it in step afterwards, so Reports,
  the Calendar, and the exports count it once. Deferred for now: editing
  programs inside the app, importing other programs, a progression engine, and
  charts beyond the basic volume figure.
