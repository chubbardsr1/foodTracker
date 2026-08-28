/**
 * The workout program module against a real SQLite database with every
 * migration in `drizzle/` applied, exactly as Wrangler applies them.
 *
 * Covers the VASA import and its idempotency, program and cycle retrieval,
 * profile isolation, starting and resuming a workout, the snapshots a session
 * freezes, set tracking, completion, the linked activity diary entry, and the
 * four-week rollover into a second cycle.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { migrationFiles, openTestDatabase } from "../../tests/support/d1-sqlite.mjs";

const database = await openTestDatabase();
const programs = await import("../../app/api/workouts/programs/route.ts");
const cycles = await import("../../app/api/workouts/cycles/route.ts");
const sessions = await import("../../app/api/workouts/sessions/route.ts");
const sets = await import("../../app/api/workouts/sets/route.ts");
const exercises = await import("../../app/api/workouts/exercises/route.ts");
const exerciseApi = await import("../../app/api/exercise/route.ts");
const reportsApi = await import("../../app/api/reports/route.ts");
const { vasaProgram } = await import("../../app/api/workouts/vasa-program.ts");

const headers = { "content-type": "application/json", "x-food-tracker-profile": "chris" };
const sarahHeaders = { "content-type": "application/json", "x-food-tracker-profile": "sarah" };

const json = async (response) => [response.status, await response.json()];
const getProgram = (query = "", who = headers) =>
  programs.GET(new Request(`http://x/api/workouts/programs?${query}`, { headers: who }));
const getCycles = (query = "", who = headers) =>
  cycles.GET(new Request(`http://x/api/workouts/cycles?${query}`, { headers: who }));
const postCycle = (body, who = headers) =>
  cycles.POST(new Request("http://x/api/workouts/cycles", { method: "POST", headers: who, body: JSON.stringify(body) }));
const putCycle = (body, who = headers) =>
  cycles.PUT(new Request("http://x/api/workouts/cycles", { method: "PUT", headers: who, body: JSON.stringify(body) }));
const startWorkout = (body, who = headers) =>
  sessions.POST(new Request("http://x/api/workouts/sessions", { method: "POST", headers: who, body: JSON.stringify(body) }));
const getSessions = (query = "", who = headers) =>
  sessions.GET(new Request(`http://x/api/workouts/sessions?${query}`, { headers: who }));
const putSession = (body, who = headers) =>
  sessions.PUT(new Request("http://x/api/workouts/sessions", { method: "PUT", headers: who, body: JSON.stringify(body) }));
const deleteSession = (id, who = headers) =>
  sessions.DELETE(new Request(`http://x/api/workouts/sessions?id=${id}`, { method: "DELETE", headers: who }));
const putSet = (body, who = headers) =>
  sets.PUT(new Request("http://x/api/workouts/sets", { method: "PUT", headers: who, body: JSON.stringify(body) }));
const postSet = (body, who = headers) =>
  sets.POST(new Request("http://x/api/workouts/sets", { method: "POST", headers: who, body: JSON.stringify(body) }));
const putExercise = (body, who = headers) =>
  exercises.PUT(new Request("http://x/api/workouts/exercises", { method: "PUT", headers: who, body: JSON.stringify(body) }));

/** Ticks every set of an exercise and marks the reps that were actually done. */
async function completeExercise(exercise, reps = null, weight = null) {
  for (const set of exercise.sets) {
    const [status] = await json(await putSet({
      id: set.id,
      actualReps: reps ?? set.targetReps,
      weight: weight ?? set.weight,
      completed: true,
    }));
    assert.equal(status, 200);
  }
}

const templateFor = (data, week, workout) =>
  data.weeks.find(item => item.weekNumber === week).workouts.find(item => item.workoutNumber === workout);

test("the migration creates the workout tables without touching the diary", () => {
  assert.ok(migrationFiles().includes("0011_workout_programs.sql"));
  const tables = database.prepare("select name from sqlite_master where type = 'table'").all().map(row => row.name);
  for (const table of [
    "exercise_library", "workout_programs", "workout_program_weeks", "workout_templates",
    "workout_template_exercises", "workout_program_cycles", "workout_sessions",
    "workout_session_exercises", "workout_sets",
  ]) {
    assert.ok(tables.includes(table), `${table} is missing`);
  }
  // The existing activity diary is untouched: same columns, same shape.
  const columns = database.prepare("pragma table_info(exercise_entries)").all().map(column => column.name);
  assert.deepEqual(
    [...columns].sort(),
    ["activity", "calories", "comments", "created_at", "exercised_on", "id", "minutes", "owner"],
  );
});

test("reading the program imports VASA and returns four weeks of three workouts", async () => {
  const [status, data] = await json(await getProgram("today=2026-08-28"));
  assert.equal(status, 200);
  assert.equal(data.program.name, "VASA Four-Week Fitness Program");
  assert.equal(data.program.totalWeeks, 4);
  assert.equal(data.program.weeks.length, 4);
  for (const week of data.program.weeks) assert.equal(week.templates.length, 3);
  // There is no Week 5.
  assert.equal(data.program.weeks.some(week => week.weekNumber === 5), false);
  // Importing the program starts nothing.
  assert.deepEqual(data.cycles, []);
  assert.equal(data.selectedCycleId, null);
});

test("the import is idempotent: reading it again duplicates nothing", async () => {
  const before = database.prepare("select count(*) as count from workout_template_exercises").get().count;
  const { importVasaProgram } = await import("../../app/api/workouts/seed.ts");
  const { getDb } = await import("../../db/index.ts");
  await importVasaProgram(getDb());
  await importVasaProgram(getDb());
  await getProgram();
  const after = database.prepare("select count(*) as count from workout_template_exercises").get().count;
  assert.equal(after, before);
  assert.equal(database.prepare("select count(*) as count from workout_programs").get().count, 1);
  assert.equal(database.prepare("select count(*) as count from workout_program_weeks").get().count, 4);
  assert.equal(database.prepare("select count(*) as count from workout_templates").get().count, 12);
  assert.equal(
    database.prepare("select count(*) as count from exercise_library").get().count,
    vasaProgram.exercises.length,
  );
});

test("the seeded exercises keep blanks blank and drop the mismatched descriptions", async () => {
  const treadmill = database.prepare("select * from exercise_library where slug = 'cardio-incline-treadmill-walk'").get();
  // The source repeats the lat-pulldown text here; a wrong instruction is not
  // seeded as a valid one.
  assert.equal(treadmill.description, null);
  assert.equal(treadmill.measurement_type, "distance_duration");

  const pushUp = database.prepare("select * from exercise_library where slug = 'box-elevated-push-up'").get();
  assert.match(pushUp.description, /Place your hands on a box or bench/);
  assert.equal(/row the dumbbell/i.test(pushUp.description), false);

  // Week 3's treadmill row has no sets, reps, or duration in the source.
  const blank = database.prepare(`
    select te.* from workout_template_exercises te
    join workout_templates t on t.id = te.workout_template_id
    join exercise_library e on e.id = te.exercise_id
    where t.week_number = 3 and t.workout_number = 2 and e.slug = 'cardio-incline-treadmill-walk'
  `).get();
  assert.equal(blank.target_sets, null);
  assert.equal(blank.target_reps, null);
  assert.equal(blank.target_duration_minutes, null);

  // Week 4's lat pulldown is blank too, and stays blank rather than becoming 0.
  const pulldown = database.prepare(`
    select te.* from workout_template_exercises te
    join workout_templates t on t.id = te.workout_template_id
    join exercise_library e on e.id = te.exercise_id
    where t.week_number = 4 and t.workout_number = 2 and e.slug = 'seated-lat-pulldown'
  `).get();
  assert.equal(pulldown.target_sets, null);
  assert.equal(pulldown.target_reps, null);

  // "12 each side" is a per-side rep count, not a rep count of its own.
  const lunge = database.prepare(`
    select te.* from workout_template_exercises te
    join workout_templates t on t.id = te.workout_template_id
    join exercise_library e on e.id = te.exercise_id
    where t.week_number = 2 and t.workout_number = 1 and e.slug = 'dumbbell-reverse-lunge'
  `).get();
  assert.equal(lunge.target_reps, 12);
  assert.equal(lunge.is_per_side, 1);
});

test("no cycle exists until one is created with an explicit start date", async () => {
  const [, proposal] = await json(await getCycles("proposal=1&today=2026-08-28"));
  assert.equal(proposal.proposal.cycleNumber, 1);
  // The published start date is proposed, and is only a default.
  assert.equal(proposal.proposal.startDate, "2026-08-31");
  assert.equal(proposal.proposal.scheduledEndDate, "2026-09-27");
  assert.equal(proposal.cycles.length, 0);
  assert.deepEqual(proposal.proposal.incomplete, []);
});

test("Cycle 1 runs Monday 31 August to Sunday 27 September 2026", async () => {
  const [status, data] = await json(await postCycle({ startDate: "2026-08-31", today: "2026-08-28" }));
  assert.equal(status, 201);
  assert.equal(data.cycle.cycleNumber, 1);
  assert.equal(data.cycle.startDate, "2026-08-31");
  assert.equal(data.cycle.scheduledEndDate, "2026-09-27");
  // Before its start date the cycle is upcoming, and no week has begun.
  assert.equal(data.cycle.status, "upcoming");
  assert.equal(data.cycle.recommendedWeek, null);
});

test("before the start date the cycle reads as upcoming with no week started", async () => {
  const [, data] = await json(await getProgram("today=2026-08-28"));
  assert.equal(data.cycles.length, 1);
  assert.equal(data.cycles[0].phase, "upcoming");
  assert.equal(data.cycles[0].recommendedWeek, null);
  for (const week of data.weeks) {
    assert.equal(week.status, "not_started");
    assert.equal(week.progressLabel, "Not started");
  }
  // The weeks are still browsable, with their scheduled ranges.
  assert.deepEqual(data.weeks[0].range, { start: "2026-08-31", end: "2026-09-06" });
  assert.deepEqual(data.weeks[3].range, { start: "2026-09-21", end: "2026-09-27" });
});

test("the recommended week follows the calendar without locking any week", async () => {
  const week1 = await json(await getProgram("today=2026-09-02"));
  assert.equal(week1[1].cycles[0].recommendedWeek, 1);
  const week2 = await json(await getProgram("today=2026-09-09"));
  assert.equal(week2[1].cycles[0].recommendedWeek, 2);
  const week4 = await json(await getProgram("today=2026-09-27"));
  assert.equal(week4[1].cycles[0].recommendedWeek, 4);
  // Past the end it stays on Week 4 rather than inventing a Week 5.
  const after = await json(await getProgram("today=2026-10-15"));
  assert.equal(after[1].cycles[0].recommendedWeek, 4);
});

test("one profile never sees the other's cycles", async () => {
  const [, hers] = await json(await getProgram("today=2026-08-28", sarahHeaders));
  assert.deepEqual(hers.cycles, []);
  // The shared program is still readable by both.
  assert.equal(hers.program.slug, vasaProgram.slug);
});

test("starting a workout snapshots what it prescribed and prepopulates its sets", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const cycleId = data.selectedCycleId;
  const template = templateFor(data, 1, 1);
  assert.equal(template.status, "not_started");

  const [status, started] = await json(await startWorkout({
    templateId: template.templateId, cycleId, workoutDate: "2026-08-31",
  }));
  assert.equal(status, 201);
  assert.equal(started.resumed, false);
  const session = started.session;
  // Starting is not finishing.
  assert.equal(session.status, "in_progress");
  assert.equal(session.completedAt, null);
  assert.equal(session.programNameSnapshot, "VASA Four-Week Fitness Program");
  assert.equal(session.cycleNumberSnapshot, 1);
  assert.equal(session.weekNumberSnapshot, 1);
  assert.equal(session.workoutNumberSnapshot, 1);
  assert.equal(session.exercises.length, 7);

  const squat = session.exercises[0];
  assert.equal(squat.exerciseNameSnapshot, "Kettlebell Goblet Squat");
  assert.equal(squat.targetSetsSnapshot, 3);
  assert.equal(squat.targetRepsSnapshot, 12);
  // Three prescribed working sets, preloaded with the target reps and nothing
  // ticked.
  assert.equal(squat.sets.length, 3);
  assert.deepEqual(squat.sets.map(set => set.setNumber), [1, 2, 3]);
  assert.ok(squat.sets.every(set => set.setType === "working" && set.completed === 0));
  assert.ok(squat.sets.every(set => set.actualReps === 12));
  assert.ok(squat.sets.every(set => set.weight === null));

  // Cardio gets one timed set and no reps at all.
  const cardio = session.exercises[6];
  assert.equal(cardio.measurementTypeSnapshot, "duration");
  assert.equal(cardio.sets.length, 1);
  assert.equal(cardio.sets[0].durationSeconds, 1200);
  assert.equal(cardio.sets[0].targetReps, null);
});

test("starting the same workout again resumes rather than duplicating", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const template = templateFor(data, 1, 1);
  assert.equal(template.status, "in_progress");
  assert.ok(template.activeSessionId);

  const [status, again] = await json(await startWorkout({
    templateId: template.templateId, cycleId: data.selectedCycleId,
  }));
  assert.equal(status, 200);
  assert.equal(again.resumed, true);
  assert.equal(again.session.id, template.activeSessionId);
  const count = database.prepare("select count(*) as count from workout_sessions where owner = 'chris'").get().count;
  assert.equal(count, 1);
});

test("a class workout starts with no sets and does not demand any", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const template = templateFor(data, 1, 3);
  const [status, started] = await json(await startWorkout({
    templateId: template.templateId, cycleId: data.selectedCycleId, workoutDate: "2026-09-02",
  }));
  assert.equal(status, 201);
  assert.equal(started.session.exercises.length, 1);
  assert.equal(started.session.exercises[0].measurementTypeSnapshot, "class");
  assert.equal(started.session.exercises[0].sets.length, 0);
  await deleteSession(started.session.id);
});

test("invalid and negative set values are refused", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const sessionId = templateFor(data, 1, 1).activeSessionId;
  const [, detail] = await json(await getSessions(`id=${sessionId}`));
  const set = detail.session.exercises[0].sets[0];

  for (const body of [
    { id: set.id, actualReps: -1 },
    { id: set.id, weight: -20 },
    { id: set.id, actualReps: 4.5 },
    { id: set.id, difficulty: 44 },
    { id: set.id, setType: "cheat" },
  ]) {
    const [status] = await json(await putSet(body));
    assert.equal(status, 400, `${JSON.stringify(body)} should be refused`);
  }
  // Zero reps is a real answer and is accepted.
  const [ok] = await json(await putSet({ id: set.id, actualReps: 0, weight: 0 }));
  assert.equal(ok, 200);
});

test("saving sets records them and keeps the exercise status in step", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const sessionId = templateFor(data, 1, 1).activeSessionId;
  const [, detail] = await json(await getSessions(`id=${sessionId}`));
  const squat = detail.session.exercises[0];

  const [status, first] = await json(await putSet({ id: squat.sets[0].id, actualReps: 12, weight: 35, completed: true }));
  assert.equal(status, 200);
  assert.equal(first.set.completed, 1);
  assert.equal(first.set.weight, 35);
  // One of three done, so the exercise is partly done rather than finished.
  assert.equal(first.exerciseStatus, "partial");

  await putSet({ id: squat.sets[1].id, actualReps: 12, weight: 35, completed: true });
  const [, last] = await json(await putSet({ id: squat.sets[2].id, actualReps: 10, weight: 35, completed: true }));
  assert.equal(last.exerciseStatus, "completed");

  // Volume counts completed working sets only: (12 + 12 + 10) × 35.
  const [, reloaded] = await json(await getSessions(`id=${sessionId}`));
  assert.equal(reloaded.volume, 1190);
});

test("an extra set can be added, and a skipped exercise stays skipped", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const sessionId = templateFor(data, 1, 1).activeSessionId;
  const [, detail] = await json(await getSessions(`id=${sessionId}`));
  const row = detail.session.exercises[1];

  const [status, added] = await json(await postSet({ sessionExerciseId: row.id }));
  assert.equal(status, 201);
  assert.equal(added.set.setNumber, 4);
  assert.equal(added.set.targetReps, 12);

  const [, skipped] = await json(await putExercise({ id: row.id, status: "skipped", exerciseNotes: "Straps were taken" }));
  assert.equal(skipped.exercise.status, "skipped");
  // Ticking a set does not undo a deliberate skip.
  const [, saved] = await json(await putSet({ id: added.set.id, actualReps: 8, completed: true }));
  assert.equal(saved.exerciseStatus, "skipped");
});

test("completing a workout writes exactly one linked activity diary entry", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const sessionId = templateFor(data, 1, 1).activeSessionId;
  const [status, finished] = await json(await putSession({
    id: sessionId, action: "complete", durationMinutes: 52, caloriesBurned: 310,
    perceivedDifficulty: 7, notes: "Felt strong.",
  }));
  assert.equal(status, 200);
  assert.equal(finished.session.status, "completed");
  assert.ok(finished.session.completedAt);
  assert.equal(finished.session.durationMinutes, 52);
  assert.ok(finished.session.linkedActivityEntryId);

  const [, day] = await json(await exerciseApi.GET(new Request("http://x/api/exercise?date=2026-08-31", { headers })));
  assert.equal(day.entries.length, 1);
  assert.equal(day.entries[0].activity, "Strength Training – VASA, Cycle 1, Week 1, Workout 1");
  assert.equal(day.entries[0].minutes, 52);
  assert.equal(day.entries[0].calories, 310);
  assert.match(day.entries[0].comments, /Working sets completed:/);
  assert.match(day.entries[0].comments, /Felt strong\./);
});

test("completing again updates the same diary entry instead of adding a second", async () => {
  const [, data] = await json(await getProgram("today=2026-08-31"));
  const [, history] = await json(await getSessions("cycle=" + data.selectedCycleId));
  const session = history.sessions.find(item => item.weekNumberSnapshot === 1 && item.workoutNumberSnapshot === 1);

  await putSession({ id: session.id, action: "complete", durationMinutes: 55, caloriesBurned: 330 });
  await putSession({ id: session.id, action: "partial", durationMinutes: 55, caloriesBurned: 330 });

  const [, day] = await json(await exerciseApi.GET(new Request("http://x/api/exercise?date=2026-08-31", { headers })));
  assert.equal(day.entries.length, 1, "a re-completed workout must not add a second diary entry");
  assert.equal(day.entries[0].minutes, 55);
  assert.equal(day.entries[0].calories, 330);

  // Reports read the diary, so the day counts one session, not two.
  const [, report] = await json(await reportsApi.GET(new Request("http://x/api/reports?start=2026-08-31&end=2026-08-31", { headers })));
  assert.equal(report.totals.sessions, 1);
  assert.equal(report.totals.exerciseMinutes, 55);
  assert.equal(report.totals.exerciseCalories, 330);

  // Put it back to completed for the week-status checks that follow.
  await putSession({ id: session.id, action: "complete" });
});

test("week status is derived from its workouts, never from the calendar", async () => {
  const [, data] = await json(await getProgram("today=2026-09-02"));
  const week1 = data.weeks.find(week => week.weekNumber === 1);
  assert.equal(week1.status, "partial");
  assert.equal(week1.progressLabel, "1 of 3 workouts completed");
  // Week 2's dates have not arrived and Week 4's never will inside this week,
  // but neither is closed off or marked anything but not started.
  assert.equal(data.weeks.find(week => week.weekNumber === 2).status, "not_started");
  assert.equal(data.weeks.find(week => week.weekNumber === 4).status, "not_started");
});

test("a prior week's workout can be finished late and stays in its own week", async () => {
  const [, data] = await json(await getProgram("today=2026-09-10"));
  const cycleId = data.selectedCycleId;
  // The calendar is inside Week 2, and a Week 1 workout is still available.
  assert.equal(data.cycles[0].recommendedWeek, 2);
  const late = templateFor(data, 1, 2);
  const [, started] = await json(await startWorkout({ templateId: late.templateId, cycleId, workoutDate: "2026-09-10" }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  for (const exercise of detail.session.exercises) await completeExercise(exercise, 12, 90);
  await putSession({ id: started.session.id, action: "complete", durationMinutes: 47 });

  const [, after] = await json(await getSessions(`id=${started.session.id}`));
  // Recorded against Cycle 1, Week 1, Workout 2, on the day it was performed.
  assert.equal(after.session.cycleNumberSnapshot, 1);
  assert.equal(after.session.weekNumberSnapshot, 1);
  assert.equal(after.session.workoutNumberSnapshot, 2);
  assert.equal(after.session.workoutDate, "2026-09-10");

  const [, program] = await json(await getProgram("today=2026-09-10"));
  assert.equal(program.weeks.find(week => week.weekNumber === 1).progressLabel, "2 of 3 workouts completed");
  // The cycle's dates are unchanged by a late completion.
  assert.equal(program.cycles[0].startDate, "2026-08-31");
  assert.equal(program.cycles[0].scheduledEndDate, "2026-09-27");
  // And Week 2 has not been credited with it.
  assert.equal(program.weeks.find(week => week.weekNumber === 2).status, "not_started");
});

test("workouts can be done out of order", async () => {
  const [, data] = await json(await getProgram("today=2026-09-10"));
  const cycleId = data.selectedCycleId;
  const ahead = templateFor(data, 3, 1);
  const [, started] = await json(await startWorkout({ templateId: ahead.templateId, cycleId, workoutDate: "2026-09-10" }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  for (const exercise of detail.session.exercises) await completeExercise(exercise, 10, 40);
  await putSession({ id: started.session.id, action: "complete" });

  const [, program] = await json(await getProgram("today=2026-09-10"));
  assert.equal(program.weeks.find(week => week.weekNumber === 3).progressLabel, "1 of 3 workouts completed");
  assert.equal(program.weeks.find(week => week.weekNumber === 2).status, "not_started");
});

test("a partial workout is recorded as partial", async () => {
  const [, data] = await json(await getProgram("today=2026-09-14"));
  const cycleId = data.selectedCycleId;
  const template = templateFor(data, 2, 1);
  const [, started] = await json(await startWorkout({ templateId: template.templateId, cycleId, workoutDate: "2026-09-14" }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  await completeExercise(detail.session.exercises[0], 12, 25);
  const [, finished] = await json(await putSession({ id: started.session.id, action: "partial", durationMinutes: 20 }));
  assert.equal(finished.session.status, "partial");

  const [, program] = await json(await getProgram("today=2026-09-14"));
  const week2 = program.weeks.find(week => week.weekNumber === 2);
  assert.equal(week2.status, "partial");
  assert.equal(week2.workouts.find(workout => workout.workoutNumber === 1).status, "partial");
  // A part-finished workout is never described as an untouched week.
  assert.equal(week2.progressLabel, "1 workout partly done");
});

test("previous performance is shown, and reaches back beyond the current cycle", async () => {
  const [, data] = await json(await getProgram("today=2026-09-16"));
  const cycleId = data.selectedCycleId;
  // Week 3 Workout 1 repeats the goblet squat from Week 1 Workout 1.
  const template = templateFor(data, 4, 1);
  const [, started] = await json(await startWorkout({ templateId: template.templateId, cycleId, workoutDate: "2026-09-16" }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  const rows = detail.session.exercises;
  const previous = detail.previous;
  const rowWithHistory = rows.find(row => previous[row.exerciseId]);
  assert.ok(rowWithHistory, "at least one exercise should carry previous performance");
  assert.ok(previous[rowWithHistory.exerciseId].workoutDate);
  assert.ok(previous[rowWithHistory.exerciseId].sets.length > 0);
  await deleteSession(started.session.id);
});

test("a second cycle starts fresh and leaves Cycle 1 exactly as it was", async () => {
  const [, before] = await json(await getProgram("today=2026-09-28"));
  const firstCycleId = before.selectedCycleId;
  const week1Before = before.weeks.find(week => week.weekNumber === 1).progressLabel;

  const [, proposal] = await json(await getCycles("proposal=1&today=2026-09-28"));
  assert.equal(proposal.proposal.cycleNumber, 2);
  // The Monday after Cycle 1's scheduled end.
  assert.equal(proposal.proposal.startDate, "2026-09-28");
  assert.equal(proposal.proposal.scheduledEndDate, "2026-10-25");
  assert.ok(proposal.proposal.incomplete.length > 0, "outstanding Cycle 1 workouts should be listed");

  const [status, created] = await json(await postCycle({ startDate: "2026-09-28", today: "2026-09-28" }));
  assert.equal(status, 201);
  assert.equal(created.cycle.cycleNumber, 2);
  assert.equal(created.cycle.status, "active");

  const [, second] = await json(await getProgram(`today=2026-09-28&cycle=${created.cycle.id}`));
  assert.equal(second.selectedCycleId, created.cycle.id);
  assert.equal(second.cycles.length, 2);
  // Every Cycle 2 workout starts not started.
  for (const week of second.weeks) {
    assert.equal(week.status, "not_started");
    for (const workout of week.workouts) assert.equal(workout.status, "not_started");
  }
  // Cycle 1 keeps its statuses and its sessions.
  const [, first] = await json(await getProgram(`today=2026-09-28&cycle=${firstCycleId}`));
  assert.equal(first.weeks.find(week => week.weekNumber === 1).progressLabel, week1Before);
});

test("overlapping cycles are refused unless the overlap is confirmed", async () => {
  const [status, refused] = await json(await postCycle({ startDate: "2026-10-05", today: "2026-09-28" }));
  assert.equal(status, 409);
  assert.match(refused.error, /already runs from/);
  assert.equal(database.prepare("select count(*) as count from workout_program_cycles where owner = 'chris'").get().count, 2);

  const [allowed, created] = await json(await postCycle({ startDate: "2026-10-05", today: "2026-09-28", allowOverlap: true }));
  assert.equal(allowed, 201);
  assert.equal(created.cycle.cycleNumber, 3);
  // Tidy up so later assertions are not confused by a deliberate overlap.
  await putCycle({ id: created.cycle.id, status: "archived" });
});

test("finishing a Cycle 1 workout after Cycle 2 begins counts only for Cycle 1", async () => {
  const [, data] = await json(await getProgram("today=2026-10-01"));
  const cycle2 = data.cycles.find(cycle => cycle.cycleNumber === 2);
  const cycle1 = data.cycles.find(cycle => cycle.cycleNumber === 1);

  const [, cycle1View] = await json(await getProgram(`today=2026-10-01&cycle=${cycle1.id}`));
  const outstanding = templateFor(cycle1View, 3, 2);
  assert.equal(outstanding.status, "not_started");

  const [, started] = await json(await startWorkout({
    templateId: outstanding.templateId, cycleId: cycle1.id, workoutDate: "2026-10-01",
  }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  for (const exercise of detail.session.exercises) await completeExercise(exercise, 10, 60);
  await putSession({ id: started.session.id, action: "complete", durationMinutes: 45 });

  const [, cycle1After] = await json(await getProgram(`today=2026-10-01&cycle=${cycle1.id}`));
  assert.equal(templateFor(cycle1After, 3, 2).status, "completed");
  // The matching Cycle 2 workout is untouched.
  const [, cycle2After] = await json(await getProgram(`today=2026-10-01&cycle=${cycle2.id}`));
  assert.equal(templateFor(cycle2After, 3, 2).status, "not_started");
  // And it is recorded on the day it was actually performed.
  const [, session] = await json(await getSessions(`id=${started.session.id}`));
  assert.equal(session.session.cycleNumberSnapshot, 1);
  assert.equal(session.session.workoutDate, "2026-10-01");
});

test("history survives the program being edited afterwards", async () => {
  const [, history] = await json(await getSessions("status=completed"));
  const session = history.sessions[history.sessions.length - 1];
  const [, before] = await json(await getSessions(`id=${session.id}`));
  const name = before.session.exercises[0].exerciseNameSnapshot;

  // Rename an exercise and blank its video, exactly as an edit would.
  database.prepare("update exercise_library set name = 'Renamed movement', video_url = null where slug = 'kettlebell-goblet-squat'").run();
  database.prepare("update workout_templates set name = 'Renamed workout' where week_number = 1 and workout_number = 1").run();

  const [, after] = await json(await getSessions(`id=${session.id}`));
  assert.equal(after.session.exercises[0].exerciseNameSnapshot, name);
  assert.equal(after.session.templateNameSnapshot, before.session.templateNameSnapshot);
  assert.equal(after.session.exercises[0].videoUrlSnapshot, before.session.exercises[0].videoUrlSnapshot);

  // Put the library back so the seed check at the end of the file still holds.
  const { importVasaProgram } = await import("../../app/api/workouts/seed.ts");
  const { getDb } = await import("../../db/index.ts");
  await importVasaProgram(getDb());
});

test("one profile can never read or change the other's workouts", async () => {
  const [, mine] = await json(await getSessions("status=completed"));
  const session = mine.sessions[0];

  const [detailStatus] = await json(await getSessions(`id=${session.id}`, sarahHeaders));
  assert.equal(detailStatus, 404);
  const [updateStatus] = await json(await putSession({ id: session.id, action: "abandon" }, sarahHeaders));
  assert.equal(updateStatus, 404);
  const [deleteStatus] = await json(await deleteSession(session.id, sarahHeaders));
  assert.equal(deleteStatus, 404);

  const [, detail] = await json(await getSessions(`id=${session.id}`));
  const setId = detail.session.exercises[0].sets[0]?.id;
  if (setId) {
    const [setStatus] = await json(await putSet({ id: setId, actualReps: 99 }, sarahHeaders));
    assert.equal(setStatus, 404);
  }
  const [exerciseStatus] = await json(await putExercise({ id: detail.session.exercises[0].id, status: "skipped" }, sarahHeaders));
  assert.equal(exerciseStatus, 404);
  // Sarah cannot start a workout inside Chris's cycle either.
  const [, data] = await json(await getProgram("today=2026-10-01"));
  const [startStatus] = await json(await startWorkout({
    templateId: templateFor(data, 2, 2).templateId, cycleId: data.selectedCycleId,
  }, sarahHeaders));
  assert.equal(startStatus, 404);
});

test("a cycle is not completed just because its end date passed", async () => {
  const [, data] = await json(await getProgram("today=2026-11-30"));
  const cycle1 = data.cycles.find(cycle => cycle.cycleNumber === 1);
  assert.equal(cycle1.status, "upcoming");
  // Its stored status was never rewritten by the passing of time; only the
  // display phase reflects that it is under way.
  assert.equal(cycle1.phase, "active");
  const [, marked] = await json(await putCycle({ id: cycle1.id, status: "completed" }));
  assert.equal(marked.cycle.status, "completed");
  const [, after] = await json(await getProgram("today=2026-11-30"));
  assert.equal(after.cycles.find(cycle => cycle.cycleNumber === 1).phase, "completed");
});

test("abandoning a workout removes its diary entry rather than counting it", async () => {
  const [, data] = await json(await getProgram("today=2026-10-05"));
  const cycle2 = data.cycles.find(cycle => cycle.cycleNumber === 2);
  const template = templateFor(data, 1, 1);
  const [, started] = await json(await startWorkout({ templateId: template.templateId, cycleId: cycle2.id, workoutDate: "2026-10-05" }));
  const [, detail] = await json(await getSessions(`id=${started.session.id}`));
  await completeExercise(detail.session.exercises[0], 12, 30);
  await putSession({ id: started.session.id, action: "complete", durationMinutes: 30 });

  let [, day] = await json(await exerciseApi.GET(new Request("http://x/api/exercise?date=2026-10-05", { headers })));
  assert.equal(day.entries.length, 1);

  const [, abandoned] = await json(await putSession({ id: started.session.id, action: "abandon" }));
  assert.equal(abandoned.session.status, "abandoned");
  assert.equal(abandoned.session.linkedActivityEntryId, null);
  [, day] = await json(await exerciseApi.GET(new Request("http://x/api/exercise?date=2026-10-05", { headers })));
  assert.equal(day.entries.length, 0);

  // An abandoned session leaves the workout available to start again.
  const [, program] = await json(await getProgram(`today=2026-10-05&cycle=${cycle2.id}`));
  assert.equal(templateFor(program, 1, 1).status, "not_started");
});

test("deleting a workout removes its sets and its diary entry", async () => {
  const [, data] = await json(await getProgram("today=2026-10-06"));
  const cycle2 = data.cycles.find(cycle => cycle.cycleNumber === 2);
  const [, started] = await json(await startWorkout({
    templateId: templateFor(data, 1, 2).templateId, cycleId: cycle2.id, workoutDate: "2026-10-06",
  }));
  const sessionId = started.session.id;
  await putSession({ id: sessionId, action: "complete", durationMinutes: 30 });

  const [status] = await json(await deleteSession(sessionId));
  assert.equal(status, 200);
  assert.equal(database.prepare("select count(*) as count from workout_sessions where id = ?").get(sessionId).count, 0);
  assert.equal(
    database.prepare("select count(*) as count from workout_session_exercises where workout_session_id = ?").get(sessionId).count,
    0,
  );
  const [, day] = await json(await exerciseApi.GET(new Request("http://x/api/exercise?date=2026-10-06", { headers })));
  assert.equal(day.entries.length, 0);
});

test("history can be filtered by cycle, week, and status", async () => {
  const [, all] = await json(await getSessions(""));
  assert.ok(all.sessions.length > 0);
  assert.ok(all.sessions.every(session => typeof session.title === "string"));

  const [, week1] = await json(await getSessions("week=1&status=completed"));
  assert.ok(week1.sessions.every(session => session.weekNumberSnapshot === 1 && session.status === "completed"));

  const [, ranged] = await json(await getSessions("start=2026-09-01&end=2026-09-30"));
  assert.ok(ranged.sessions.every(session => session.workoutDate >= "2026-09-01" && session.workoutDate <= "2026-09-30"));
  const [badRange] = await json(await getSessions("start=nonsense"));
  assert.equal(badRange, 400);
});

test("multi-row inserts are split to fit D1's bound-parameter limit", async () => {
  const { chunkForD1, D1_MAX_BOUND_PARAMETERS } = await import("../../app/api/workouts/store.ts");
  // A snapshotted session exercise carries about twenty columns, so seven of
  // them in one statement would be refused by D1 even though plain SQLite
  // accepts it.
  const wide = Array.from({ length: 7 }, () => Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [`column${index}`, index]),
  ));
  const chunks = chunkForD1(wide);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length * 20 <= D1_MAX_BOUND_PARAMETERS, "a statement would exceed D1's limit");
  }
  assert.equal(chunks.flat().length, 7);
  // Narrow rows still go in one statement.
  assert.equal(chunkForD1([{ a: 1 }, { a: 2 }, { a: 3 }]).length, 1);
});
