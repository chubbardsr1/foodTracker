/**
 * Idempotent import of the VASA program.
 *
 * Running this once or a hundred times leaves exactly one program, four weeks,
 * twelve workout templates, one exercise-library row per distinct exercise, and
 * one prescribed row per line of the source table. Every write is keyed on a
 * unique index — the program slug, the exercise slug, the week number, the
 * workout number, the position within a workout — so a repeat run updates in
 * place instead of inserting a second copy.
 *
 * No user data is touched. Seeding the program deliberately does not create a
 * cycle: a cycle belongs to a profile and needs a start date the user chooses,
 * so it is created only through the Start Cycle flow.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { getDb } from "../../../db";
import {
  exerciseLibrary, workoutProgramWeeks, workoutPrograms,
  workoutTemplateExercises, workoutTemplates,
} from "../../../db/schema";
import { vasaProgram } from "./vasa-program";

type Db = ReturnType<typeof getDb>;

/** Every prescribed row the seed defines, used as the cheap "already seeded" check. */
const expectedTemplateExercises = vasaProgram.weeks.reduce(
  (total, week) => total + week.templates.reduce((sum, template) => sum + template.exercises.length, 0),
  0,
);

/**
 * Ensures the VASA program exists, and returns its id.
 *
 * The common path is two reads: the program row, and a count of its prescribed
 * exercises. Only a missing or incomplete import does any writing.
 */
export async function ensureVasaProgram(db: Db) {
  const existing = await findProgram(db);
  if (existing) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workoutTemplateExercises)
      .innerJoin(workoutTemplates, eq(workoutTemplateExercises.workoutTemplateId, workoutTemplates.id))
      .where(eq(workoutTemplates.programId, existing.id));
    if (Number(count) === expectedTemplateExercises) return existing.id;
  }
  return importVasaProgram(db);
}

async function findProgram(db: Db) {
  const [row] = await db.select({ id: workoutPrograms.id })
    .from(workoutPrograms).where(eq(workoutPrograms.slug, vasaProgram.slug)).limit(1);
  return row ?? null;
}

/** Writes the whole program. Safe to run again at any time. */
export async function importVasaProgram(db: Db) {
  const now = new Date().toISOString();

  await db.insert(workoutPrograms).values({
    owner: null,
    slug: vasaProgram.slug,
    name: vasaProgram.name,
    description: vasaProgram.description,
    sourceUrl: vasaProgram.sourceUrl,
    totalWeeks: vasaProgram.totalWeeks,
    isSystem: 1,
    isActive: 1,
  }).onConflictDoUpdate({
    target: workoutPrograms.slug,
    set: {
      name: vasaProgram.name, description: vasaProgram.description,
      sourceUrl: vasaProgram.sourceUrl, totalWeeks: vasaProgram.totalWeeks, updatedAt: now,
    },
  });
  const program = await findProgram(db);
  if (!program) throw new Error("The VASA program could not be created");
  const programId = program.id;

  // Exercise definitions, keyed on their slug so a renamed exercise updates
  // rather than duplicating. A user-added exercise has its own slug and is
  // never touched here.
  for (const exercise of vasaProgram.exercises) {
    await db.insert(exerciseLibrary).values({
      owner: null,
      slug: exercise.slug,
      name: exercise.name,
      category: exercise.category,
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      equipmentType: exercise.equipmentType,
      measurementType: exercise.measurementType,
      description: exercise.description,
      videoUrl: exercise.videoUrl,
      sourceUrl: vasaProgram.sourceUrl,
      isSystem: 1,
      isActive: 1,
    }).onConflictDoUpdate({
      target: exerciseLibrary.slug,
      set: {
        name: exercise.name, category: exercise.category,
        primaryMuscleGroup: exercise.primaryMuscleGroup, equipmentType: exercise.equipmentType,
        measurementType: exercise.measurementType, description: exercise.description,
        videoUrl: exercise.videoUrl, updatedAt: now,
      },
    });
  }
  const libraryRows = await db.select({ id: exerciseLibrary.id, slug: exerciseLibrary.slug }).from(exerciseLibrary);
  const exerciseIdBySlug = new Map(libraryRows.map(row => [row.slug, row.id]));

  for (const week of vasaProgram.weeks) {
    await db.insert(workoutProgramWeeks).values({
      programId, weekNumber: week.weekNumber, name: week.name,
      description: week.description, displayOrder: week.weekNumber,
    }).onConflictDoUpdate({
      target: [workoutProgramWeeks.programId, workoutProgramWeeks.weekNumber],
      set: { name: week.name, description: week.description, displayOrder: week.weekNumber },
    });
    const [weekRow] = await db.select({ id: workoutProgramWeeks.id }).from(workoutProgramWeeks)
      .where(and(eq(workoutProgramWeeks.programId, programId), eq(workoutProgramWeeks.weekNumber, week.weekNumber)))
      .limit(1);
    if (!weekRow) throw new Error(`Week ${week.weekNumber} could not be created`);

    for (const template of week.templates) {
      await db.insert(workoutTemplates).values({
        programId, programWeekId: weekRow.id, weekNumber: week.weekNumber,
        workoutNumber: template.workoutNumber, name: template.name, workoutType: template.workoutType,
        instructions: template.instructions, displayOrder: template.workoutNumber,
        isOptional: 0, isActive: 1,
      }).onConflictDoUpdate({
        target: [workoutTemplates.programId, workoutTemplates.weekNumber, workoutTemplates.workoutNumber],
        set: {
          programWeekId: weekRow.id, name: template.name, workoutType: template.workoutType,
          instructions: template.instructions, displayOrder: template.workoutNumber, updatedAt: now,
        },
      });
      const [templateRow] = await db.select({ id: workoutTemplates.id }).from(workoutTemplates)
        .where(and(
          eq(workoutTemplates.programId, programId),
          eq(workoutTemplates.weekNumber, week.weekNumber),
          eq(workoutTemplates.workoutNumber, template.workoutNumber),
        )).limit(1);
      if (!templateRow) throw new Error(`Week ${week.weekNumber} workout ${template.workoutNumber} could not be created`);

      for (const [index, prescribed] of template.exercises.entries()) {
        const exerciseId = exerciseIdBySlug.get(prescribed.exerciseSlug);
        if (!exerciseId) throw new Error(`Unknown exercise ${prescribed.exerciseSlug}`);
        // A blank source cell stays null here; nothing is defaulted to zero.
        const values = {
          workoutTemplateId: templateRow.id,
          exerciseId,
          targetSets: prescribed.targetSets ?? null,
          targetReps: prescribed.targetReps ?? null,
          targetDurationMinutes: prescribed.targetDurationMinutes ?? null,
          targetIncline: prescribed.targetIncline ?? null,
          isPerSide: prescribed.isPerSide ? 1 : 0,
          displayOrder: index + 1,
        };
        await db.insert(workoutTemplateExercises).values(values).onConflictDoUpdate({
          target: [workoutTemplateExercises.workoutTemplateId, workoutTemplateExercises.displayOrder],
          set: {
            exerciseId, targetSets: values.targetSets, targetReps: values.targetReps,
            targetDurationMinutes: values.targetDurationMinutes, targetIncline: values.targetIncline,
            isPerSide: values.isPerSide, updatedAt: now,
          },
        });
      }
      // If a workout ever loses a line, its stale rows go rather than lingering
      // beyond the end of the prescribed list.
      await db.delete(workoutTemplateExercises).where(and(
        eq(workoutTemplateExercises.workoutTemplateId, templateRow.id),
        gte(workoutTemplateExercises.displayOrder, template.exercises.length + 1),
      ));
    }
  }

  return programId;
}
