/**
 * The workout program dashboard feed.
 *
 * One request returns the reusable program — weeks, workouts, prescribed
 * exercises, descriptions, and videos — together with this profile's cycles and
 * the status of every workout inside the selected cycle. Program content is
 * shared; cycles and statuses are always scoped to the requesting profile.
 *
 * Reading a program never creates a cycle and never starts anything.
 */
import { getDb } from "../../../../db";
import { localDate } from "../../../shared";
import {
  recommendedWeek, weekProgressLabel, weekRange, weekStatusFrom, type WorkoutStatus,
} from "../../../workout-shared";
import { profileFrom } from "../../profile";
import { ensureVasaProgram } from "../seed";
import { cycleProgress, findProgramBySlug, loadCycles, loadProgram } from "../store";
import { vasaProgram } from "../vasa-program";

/**
 * How a cycle should read on screen today.
 *
 * A cycle whose dates have passed is not moved to completed on its own, and a
 * cycle is never activated before its start date arrives.
 */
export function cyclePhase(cycle: { status: string; startDate: string }, today: string) {
  if (cycle.status === "completed" || cycle.status === "archived") return cycle.status;
  return today < cycle.startDate ? "upcoming" : "active";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const slug = params.get("slug") ?? vasaProgram.slug;
    const today = params.get("today") ?? localDate();
    const db = getDb();
    const owner = profileFrom(request);

    // The VASA import is idempotent and normally costs two reads; any other
    // program is expected to exist already.
    const programId = slug === vasaProgram.slug
      ? await ensureVasaProgram(db)
      : (await findProgramBySlug(db, slug))?.id ?? null;
    if (programId === null) return Response.json({ error: "That program was not found" }, { status: 404 });

    const [program, cycles] = await Promise.all([
      loadProgram(db, programId),
      loadCycles(db, owner, programId),
    ]);
    if (!program) return Response.json({ error: "That program was not found" }, { status: 404 });

    const described = cycles.map(cycle => ({
      ...cycle,
      phase: cyclePhase(cycle, today),
      recommendedWeek: recommendedWeek(cycle.startDate, program.totalWeeks, today),
    }));

    // The cycle to show: the one the calendar is inside, otherwise the most
    // recent one. An explicit choice always wins.
    const requested = Number(params.get("cycle"));
    const chosen = described.find(cycle => cycle.id === requested)
      ?? described.find(cycle => cycle.startDate <= today && today <= cycle.scheduledEndDate)
      ?? described[described.length - 1]
      ?? null;

    const progress = chosen ? await cycleProgress(db, owner, chosen.id) : new Map();
    const weeks = program.weeks.map(week => {
      const workouts = week.templates.map(template => {
        const entry = progress.get(template.id);
        return {
          templateId: template.id,
          workoutNumber: template.workoutNumber,
          name: template.name,
          workoutType: template.workoutType,
          status: (entry?.status ?? "not_started") as WorkoutStatus,
          activeSessionId: entry?.activeSessionId ?? null,
          sessions: entry?.sessions ?? [],
        };
      });
      const statuses = workouts.map(workout => workout.status);
      return {
        weekNumber: week.weekNumber,
        name: week.name,
        // Ranges only exist once a cycle gives the program a start date.
        range: chosen ? weekRange(chosen.startDate, week.weekNumber) : null,
        status: weekStatusFrom(statuses),
        progressLabel: weekProgressLabel(statuses),
        workouts,
      };
    });

    return Response.json({
      program,
      cycles: described,
      selectedCycleId: chosen?.id ?? null,
      weeks,
      today,
      /** Only a form default. No cycle exists until one is created explicitly. */
      defaultFirstStartDate: slug === vasaProgram.slug ? vasaProgram.defaultFirstStartDate : null,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load the program" }, { status: 500 });
  }
}
