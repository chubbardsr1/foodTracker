/**
 * Program cycles: one profile's scheduled runs of a program.
 *
 * A cycle is the only thing that gives a program dates, and it is created only
 * when the user asks for one with a start date they chose. Nothing here is
 * automatic: importing the program starts nothing, a cycle is never completed
 * because its end date passed, and a new cycle is never opened for you.
 *
 * VASA is a four-week program, so Cycle 2 is a fresh Weeks 1-4 rather than a
 * Week 5. Previous cycles keep every session, status, weight, and note.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workoutProgramCycles } from "../../../../db/schema";
import { localDate } from "../../../shared";
import {
  cycleStatuses, nextMonday, recommendedWeek, scheduledEndFor, weekRange,
} from "../../../workout-shared";
import { profileFrom } from "../../profile";
import { ensureVasaProgram } from "../seed";
import {
  cycleProgress, findCycle, findProgramBySlug, isDate, loadCycles, loadProgram, overlappingCycles,
} from "../store";
import { vasaProgram } from "../vasa-program";

/** Far enough either side of today to catch a typo without being restrictive. */
const EARLIEST_START = "2000-01-01";
const LATEST_START = "2100-12-31";

async function resolveProgramId(db: ReturnType<typeof getDb>, slug: string | null, programId: unknown) {
  if (Number.isInteger(Number(programId)) && Number(programId) > 0) return Number(programId);
  const wanted = slug ?? vasaProgram.slug;
  if (wanted === vasaProgram.slug) return ensureVasaProgram(db);
  return (await findProgramBySlug(db, wanted))?.id ?? null;
}

/**
 * What the next cycle would look like, shown for confirmation before anything
 * is created: its number, its proposed dates, and every workout still
 * outstanding in the cycle before it.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const today = params.get("today") ?? localDate();
    const db = getDb();
    const owner = profileFrom(request);
    const programId = await resolveProgramId(db, params.get("slug"), params.get("programId"));
    if (programId === null) return Response.json({ error: "That program was not found" }, { status: 404 });

    const [program, cycles] = await Promise.all([loadProgram(db, programId), loadCycles(db, owner, programId)]);
    if (!program) return Response.json({ error: "That program was not found" }, { status: 404 });
    if (params.get("proposal") !== "1") return Response.json({ cycles });

    const previous = cycles[cycles.length - 1] ?? null;
    const cycleNumber = previous ? previous.cycleNumber + 1 : 1;
    // A first VASA cycle proposes the program's published start date; every
    // later one proposes the Monday after the previous cycle ends. Both are
    // only defaults — the form can be changed before anything is created.
    const startDate = previous
      ? nextMonday(previous.scheduledEndDate)
      : (program.slug === vasaProgram.slug ? vasaProgram.defaultFirstStartDate : nextMonday(today));
    const scheduledEndDate = scheduledEndFor(startDate, program.totalWeeks);

    // Outstanding workouts stay available under their original cycle; they are
    // listed here so starting a new cycle is never a surprise.
    const incomplete: { weekNumber: number; workoutNumber: number; name: string; status: string }[] = [];
    if (previous) {
      const progress = await cycleProgress(db, owner, previous.id);
      for (const week of program.weeks) {
        for (const template of week.templates) {
          const status = progress.get(template.id)?.status ?? "not_started";
          if (status !== "completed") {
            incomplete.push({ weekNumber: week.weekNumber, workoutNumber: template.workoutNumber, name: template.name, status });
          }
        }
      }
    }

    return Response.json({
      cycles,
      proposal: {
        programId, cycleNumber, startDate, scheduledEndDate,
        totalWeeks: program.totalWeeks,
        weeks: program.weeks.map(week => ({ weekNumber: week.weekNumber, ...weekRange(startDate, week.weekNumber) })),
        previousCycle: previous ? { id: previous.id, cycleNumber: previous.cycleNumber, scheduledEndDate: previous.scheduledEndDate } : null,
        incomplete,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load cycles" }, { status: 500 });
  }
}

/** Starts a cycle. The start date always comes from the request, never the clock. */
export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const startDate = String(payload.startDate ?? "");
    const today = typeof payload.today === "string" && isDate(payload.today) ? payload.today : localDate();
    if (!isDate(startDate) || startDate < EARLIEST_START || startDate > LATEST_START) {
      return Response.json({ error: "Choose a valid start date for this cycle" }, { status: 400 });
    }

    const db = getDb();
    const owner = profileFrom(request);
    const programId = await resolveProgramId(db, typeof payload.slug === "string" ? payload.slug : null, payload.programId);
    if (programId === null) return Response.json({ error: "That program was not found" }, { status: 404 });
    const program = await loadProgram(db, programId);
    if (!program) return Response.json({ error: "That program was not found" }, { status: 404 });

    const scheduledEndDate = scheduledEndFor(startDate, program.totalWeeks);
    const existing = await loadCycles(db, owner, programId);
    const cycleNumber = (existing[existing.length - 1]?.cycleNumber ?? 0) + 1;

    // Two cycles of one program running at once is nearly always a mistake, so
    // it takes a deliberate confirmation rather than being quietly allowed.
    const clashes = await overlappingCycles(db, owner, programId, startDate, scheduledEndDate, null);
    if (clashes.length > 0 && payload.allowOverlap !== true) {
      return Response.json({
        error: `Cycle ${clashes[0].cycleNumber} already runs from ${clashes[0].startDate} to ${clashes[0].scheduledEndDate}. Choose a later start date, or confirm that you want them to overlap.`,
        overlap: clashes.map(cycle => ({ id: cycle.id, cycleNumber: cycle.cycleNumber, startDate: cycle.startDate, scheduledEndDate: cycle.scheduledEndDate })),
      }, { status: 409 });
    }

    const [cycle] = await db.insert(workoutProgramCycles).values({
      owner, programId, cycleNumber, startDate, scheduledEndDate,
      // A cycle that starts today or earlier is already under way; one starting
      // later stays Upcoming and shows "Starts <date>".
      status: startDate > today ? "upcoming" : "active",
    }).returning();

    return Response.json({
      cycle: { ...cycle, recommendedWeek: recommendedWeek(startDate, program.totalWeeks, today) },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start that cycle";
    // The unique index is the real guard against a duplicate cycle number.
    if (/unique/i.test(message)) {
      return Response.json({ error: "That cycle already exists. Reload the program and try again." }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Corrects a cycle: its status, or its start date.
 *
 * Moving a cycle's dates never moves its sessions between cycles — a session
 * keeps the cycle, week, and workout it was recorded against, and its own
 * actual date.
 */
export async function PUT(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id)) return Response.json({ error: "A valid cycle is required" }, { status: 400 });

    const db = getDb();
    const owner = profileFrom(request);
    const cycle = await findCycle(db, owner, id);
    if (!cycle) return Response.json({ error: "That cycle was not found" }, { status: 404 });

    const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (payload.status !== undefined) {
      const status = String(payload.status);
      if (!cycleStatuses.includes(status as typeof cycleStatuses[number])) {
        return Response.json({ error: "That cycle status is not valid" }, { status: 400 });
      }
      changes.status = status;
    }
    if (payload.startDate !== undefined) {
      const startDate = String(payload.startDate);
      if (!isDate(startDate) || startDate < EARLIEST_START || startDate > LATEST_START) {
        return Response.json({ error: "Choose a valid start date for this cycle" }, { status: 400 });
      }
      const program = await loadProgram(db, cycle.programId);
      if (!program) return Response.json({ error: "That program was not found" }, { status: 404 });
      const scheduledEndDate = scheduledEndFor(startDate, program.totalWeeks);
      const clashes = await overlappingCycles(db, owner, cycle.programId, startDate, scheduledEndDate, cycle.id);
      if (clashes.length > 0 && payload.allowOverlap !== true) {
        return Response.json({
          error: `Cycle ${clashes[0].cycleNumber} already covers those dates. Choose different dates, or confirm the overlap.`,
        }, { status: 409 });
      }
      changes.startDate = startDate;
      changes.scheduledEndDate = scheduledEndDate;
    }

    const [updated] = await db.update(workoutProgramCycles).set(changes)
      .where(and(eq(workoutProgramCycles.id, id), eq(workoutProgramCycles.owner, owner)))
      .returning();
    return Response.json({ cycle: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update that cycle" }, { status: 500 });
  }
}
