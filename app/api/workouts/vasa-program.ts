/**
 * The VASA Four-Week Fitness Program, as structured seed data.
 *
 * The authoritative source is `db/seed/vasa-4-week-fitness-program.md`, a
 * faithful copy of VASA's published table. This file is that table normalized
 * into the shape the database stores, and it is the only place the program's
 * content lives in code.
 *
 * Rules followed when converting it:
 *
 * - A blank source cell stays null. Nothing is invented, and a missing set,
 *   rep count, duration, or description is never turned into a zero.
 * - Only clear copy-and-paste mismatches are corrected, and every correction is
 *   listed in `vasaCorrections` below.
 * - `KB` and `DB` are expanded to Kettlebell and Dumbbell, which is a naming
 *   variant rather than a different movement. Workout-specific sets and reps
 *   are preserved exactly as prescribed, so the same exercise legitimately
 *   appears as 3 × 12 in one week and 4 × 10 in another.
 * - Cardio and Studio Red rows carry no reps. `20 Min` becomes a target
 *   duration, not a repetition count.
 */

export type MeasurementType =
  | "reps_weight"
  | "reps_bodyweight"
  | "duration"
  | "distance_duration"
  | "class";

export type SeedExercise = {
  slug: string;
  name: string;
  category: string;
  primaryMuscleGroup: string | null;
  equipmentType: string | null;
  measurementType: MeasurementType;
  description: string | null;
  videoUrl: string | null;
};

export type SeedTemplateExercise = {
  exerciseSlug: string;
  targetSets?: number | null;
  targetReps?: number | null;
  targetDurationMinutes?: number | null;
  targetIncline?: number | null;
  isPerSide?: boolean;
};

export type SeedTemplate = {
  workoutNumber: number;
  name: string;
  /** strength | machines | class */
  workoutType: string;
  instructions: string | null;
  exercises: SeedTemplateExercise[];
};

export type SeedWeek = {
  weekNumber: number;
  name: string;
  description: string | null;
  templates: SeedTemplate[];
};

const SOURCE_URL = "https://vasafitness.com/workout-general/";
const video = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/**
 * Every corrected or deliberately blanked value, so the source and the seeded
 * program can be reconciled later. Shown in the README as well.
 */
export const vasaCorrections = [
  "Week 1, Workout 2, Cardio - Incline Treadmill: the source repeats the Seated Lat Pulldown description. It is not a treadmill instruction, so the exercise is seeded with no description rather than with the wrong one.",
  "Week 2 and Week 4, Box-Elevated Push-Up: the source repeats the Dumbbell Single-Arm Row description. The correct push-up description, as published on the Week 1 and Week 3 rows for the same exercise, is used instead.",
  "Week 3, Workout 2, Cardio - Incline Treadmill: sets, reps, and description are blank in the source, so all three stay null. No duration is invented.",
  "Week 4, Workout 2, Seated Lat Pulldown: sets and reps are blank in the source and stay null. The published description and video for that exercise are kept.",
  "Week 4, Workout 1, Box-Elevated Push-Up: the source omits the video. The exercise's own published video is shown, because it is the same exercise as in Weeks 1-3.",
  "`KB` is expanded to Kettlebell and `DB` to Dumbbell, and `Box-Elevated push-up` is capitalized as `Box-Elevated Push-Up`, so the same movement is one exercise rather than several.",
  "`12 each side` (Week 2 Dumbbell Reverse Lunges) is stored as 12 reps marked per side, rather than as a rep count of its own.",
  "`20 Min` and `25 Min` cardio rows are stored as a target duration in minutes with no rep count.",
  "`12 degree incline` in the treadmill rows is stored as a target incline of 12 rather than left inside the exercise name.",
] as const;

/** Reusable exercise definitions, keyed by a stable slug. */
export const vasaExercises: SeedExercise[] = [
  {
    slug: "kettlebell-goblet-squat",
    name: "Kettlebell Goblet Squat",
    category: "strength",
    primaryMuscleGroup: "Legs",
    equipmentType: "Kettlebell",
    measurementType: "reps_weight",
    description: "Select a kettlebell and hold it by the handles at chest height. Stand with your feet shoulder-width apart and toes slightly turned out. Keep your chest tall and core engaged as you begin by sitting your hips back. Lower into a squat, keeping your elbows inside your knees and your weight in your heels. Drive through your heels to return to standing, squeezing your glutes at the top.",
    videoUrl: video("Op6aBo7diZA"),
  },
  {
    slug: "trx-underhand-row",
    name: "TRX Underhand Row",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "TRX",
    measurementType: "reps_bodyweight",
    description: "Adjust the TRX straps to mid-length and lean back to create your desired resistance level. Grip the handles with palms facing up and keep your body in a straight line from head to heels. Start with your arms fully extended and shoulders pulled down away from your ears. Pull your chest toward the handles, keeping your elbows close to your sides. Slowly extend your arms to return to the starting position.",
    videoUrl: video("kzvQ2c0Odzw"),
  },
  {
    slug: "box-elevated-push-up",
    name: "Box-Elevated Push-Up",
    category: "strength",
    primaryMuscleGroup: "Chest",
    equipmentType: "Box or bench",
    measurementType: "reps_bodyweight",
    // The Week 2 and Week 4 rows carry a dumbbell-row description in the
    // source. This is the published push-up description from Weeks 1 and 3.
    description: "Place your hands on a box or bench (use a higher surface to decrease difficulty). Position your body in a straight plank with hands under shoulders and core engaged. Begin by bending your elbows and lowering your chest toward the box while maintaining a neutral spine. Press through your palms to return to a strong plank position.",
    videoUrl: video("NyKW3envo4M"),
  },
  {
    slug: "kettlebell-deadlift",
    name: "Kettlebell Deadlift",
    category: "strength",
    primaryMuscleGroup: "Posterior chain",
    equipmentType: "Kettlebell",
    measurementType: "reps_weight",
    description: "Place a kettlebell on the floor between your feet and stand with feet hip-width apart. Hinge at your hips with a flat back and reach down to grip the handle. Brace your core before lifting. Drive through your heels to extend your hips and stand tall. Push your hips back and lower the kettlebell with control to return to the floor.",
    videoUrl: video("8C4H0Gq0VRY"),
  },
  {
    slug: "alternating-kettlebell-overhead-press",
    name: "Alternating Kettlebell Overhead Press",
    category: "strength",
    primaryMuscleGroup: "Shoulders",
    equipmentType: "Kettlebell",
    measurementType: "reps_weight",
    description: "Choose an appropriate kettlebell and hold it at shoulder height with your wrist neutral and elbow stacked under the weight. Stand tall with feet shoulder-width apart and core braced. Press the kettlebell straight overhead until your arm is fully extended. Lower it back to shoulder height with control and repeat on the opposite side.",
    videoUrl: video("z_26WzNe4dU"),
  },
  {
    slug: "dumbbell-bent-over-row",
    name: "Dumbbell Bent Over Row",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "Dumbbells",
    measurementType: "reps_weight",
    description: "Select two dumbbells and hinge forward at your hips with feet hip-width apart and back flat. Let the dumbbells hang directly below your shoulders with your core engaged. Pull the weights toward your ribcage, squeezing your shoulder blades together. Lower the dumbbells slowly back to the starting position.",
    videoUrl: video("HtmoWWWbPJM"),
  },
  {
    slug: "cardio-stair-climber",
    name: "Cardio - Stair Climber",
    category: "cardio",
    primaryMuscleGroup: "Legs",
    equipmentType: "Stair climber",
    measurementType: "duration",
    description: "Maintain upright posture and steady breathing. Drive through your full foot on each step.",
    videoUrl: null,
  },
  {
    slug: "leg-press-machine",
    name: "Leg Press Machine",
    category: "strength",
    primaryMuscleGroup: "Legs",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Adjust the seat so your knees are bent at about 90 degrees when your feet are on the platform. Sit back with your spine against the pad and feet shoulder-width apart. Begin by lowering the platform under control. Press through your heels to extend your legs, stopping just short of locking out your knees.",
    videoUrl: video("65dYEHxt3YM"),
  },
  {
    slug: "seated-chest-press-machine",
    name: "Seated Chest Press Machine",
    category: "strength",
    primaryMuscleGroup: "Chest",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Adjust the seat so the handles align with the middle of your chest. Sit upright with your back supported and feet flat on the floor. Start with elbows bent and hands gripping the handles. Press forward until your arms are extended, then return slowly to the starting position.",
    videoUrl: video("rumgdDnsO0A"),
  },
  {
    slug: "seated-row-machine",
    name: "Seated Row Machine",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Adjust the seat and chest pad so the handles are comfortably within reach. Sit tall with your chest supported and feet planted firmly. Begin with arms fully extended. Pull the handles toward your torso, squeezing your shoulder blades together. Extend your arms slowly to return to start.",
    videoUrl: video("ZS0cMdseyuM"),
  },
  {
    slug: "glute-drive-machine",
    name: "Glute Drive Machine",
    category: "strength",
    primaryMuscleGroup: "Glutes",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Adjust the back pad and position the hip pad comfortably across your hips. Place your feet hip-width apart with knees bent and back supported against the pad. Brace your core and keep your chin tucked to maintain a neutral spine. Drive through your heels to lift your hips upward, fully extending your hips and squeezing your glutes at the top. Lower your hips back down under control to return to the starting position.",
    videoUrl: video("fa9Eb1IGUvs"),
  },
  {
    slug: "seated-shoulder-press-machine",
    name: "Seated Shoulder Press",
    category: "strength",
    primaryMuscleGroup: "Shoulders",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Set the seat height so the handles begin at shoulder level. Sit upright with your back supported and feet flat. Grip the handles and press overhead until your arms are fully extended. Lower the handles back to shoulder height with control.",
    videoUrl: video("XOmDApzpykU"),
  },
  {
    slug: "seated-lat-pulldown",
    name: "Seated Lat Pulldown",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Adjust the thigh pad to secure your legs and select an appropriate weight. Sit tall with a slight lean back and grip the bar wider than shoulder-width. Start with arms fully extended overhead. Pull the bar down toward your upper chest while keeping your chest lifted. Slowly extend your arms to return to the starting position.",
    videoUrl: video("JjvFHDcIWts"),
  },
  {
    slug: "cardio-incline-treadmill-walk",
    name: "Cardio - Incline Treadmill Walk",
    category: "cardio",
    primaryMuscleGroup: "Legs",
    equipmentType: "Treadmill",
    measurementType: "distance_duration",
    // The source's description for this row is the Seated Lat Pulldown text.
    // A wrong instruction is worse than none, so this stays unset.
    description: null,
    videoUrl: null,
  },
  {
    slug: "studio-red-class",
    name: "Studio Red Class",
    category: "class",
    primaryMuscleGroup: null,
    equipmentType: null,
    measurementType: "class",
    description: "Check out your Studio Red class schedule for available times.",
    videoUrl: null,
  },
  {
    slug: "dumbbell-reverse-lunge",
    name: "Dumbbell Reverse Lunges",
    category: "strength",
    primaryMuscleGroup: "Legs",
    equipmentType: "Dumbbells",
    measurementType: "reps_weight",
    description: "Select a pair of dumbbells and hold them at your sides. Stand tall with feet hip-width apart. Step one foot backward to begin the movement. Lower until both knees reach about 90 degrees while keeping your chest upright. Drive through your front heel to return to standing and repeat on the other side.",
    videoUrl: video("zGHbpUvuqUY"),
  },
  {
    slug: "dumbbell-single-arm-row-on-bench",
    name: "Dumbbell Single-Arm Row on Bench",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "Dumbbell and bench",
    measurementType: "reps_weight",
    description: "With one knee and hand on a bench, row the dumbbell toward your hip. Lower slowly and repeat on the opposite side.",
    videoUrl: video("HtmoWWWbPJM"),
  },
  {
    slug: "single-leg-glute-bridge",
    name: "Single-Leg Glute Bridge",
    category: "strength",
    primaryMuscleGroup: "Glutes",
    equipmentType: "Mat",
    measurementType: "reps_bodyweight",
    description: "Lie on your back on a mat with one foot planted and the other leg extended. Keep your arms at your sides and core engaged. Press through the heel of the planted foot to lift your hips upward until your body forms a straight line from shoulders to knee. Lower your hips slowly back to the floor and repeat before switching sides.",
    videoUrl: video("Y0SXy73T36M"),
  },
  {
    slug: "standing-kettlebell-shoulder-press",
    name: "Standing Kettlebell Shoulder Press",
    category: "strength",
    primaryMuscleGroup: "Shoulders",
    equipmentType: "Kettlebell",
    measurementType: "reps_weight",
    description: "Select a kettlebell and hold it at shoulder height in the racked position with your wrist neutral and elbow under the weight. Stand with feet shoulder-width apart and core braced. Press the kettlebell straight overhead until your arm is fully extended. Lower it back to shoulder height with control before switching sides if needed.",
    videoUrl: video("z_26WzNe4dU"),
  },
  {
    slug: "trx-assisted-pull-up",
    name: "TRX Assisted Pull-Up",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "TRX",
    measurementType: "reps_bodyweight",
    description: "Shorten the TRX straps and adjust your body angle to control the level of assistance. Hold the handles with arms extended and body in a straight line. Engage your core and pull your chest toward the handles. Slowly extend your arms to return to the starting position.",
    videoUrl: video("nBP1OffNl5o"),
  },
  {
    slug: "hack-squat-machine",
    name: "Hack Squat Machine",
    category: "strength",
    primaryMuscleGroup: "Legs",
    equipmentType: "Machine",
    measurementType: "reps_weight",
    description: "Position your shoulders under the pads and place your feet shoulder-width apart on the platform. Stand tall with your back against the pad and unlock the safety handles. Lower into a squat under control until your knees reach about 90 degrees. Press through your heels to return to standing.",
    videoUrl: video("8Ln6VO8gsfI"),
  },
  {
    slug: "diamond-push-up",
    name: "Diamond Push-Up",
    category: "strength",
    primaryMuscleGroup: "Triceps",
    equipmentType: "Bodyweight",
    measurementType: "reps_bodyweight",
    description: "Place your hands close together beneath your chest, forming a diamond shape with your fingers (elevate your hands if needed). Position your body in a straight plank with core engaged. Lower your chest toward your hands while keeping elbows close to your sides. Press back up to return to plank.",
    videoUrl: video("sZwppbIG6Xo"),
  },
  {
    slug: "standing-cable-row",
    name: "Standing Cable Row",
    category: "strength",
    primaryMuscleGroup: "Back",
    equipmentType: "Cable",
    measurementType: "reps_weight",
    description: "Set the cable attachment at chest height and choose an appropriate weight. Stand tall with a slight bend in your knees and a neutral spine. Begin with arms fully extended. Pull the handle toward your torso while squeezing your shoulder blades together. Extend your arms slowly to return to the starting position.",
    videoUrl: video("Ba0lZDdZnLw"),
  },
  {
    slug: "dumbbell-lateral-raise",
    name: "Dumbbell Lateral Raise",
    category: "strength",
    primaryMuscleGroup: "Shoulders",
    equipmentType: "Dumbbells",
    measurementType: "reps_weight",
    description: "Select light-to-moderate dumbbells and stand with feet hip-width apart. Hold the weights at your sides with a slight bend in your elbows and core engaged. Raise your arms out to the sides until they reach shoulder height. Lower the dumbbells slowly back to your sides.",
    videoUrl: video("T6I0ggj4ZIk"),
  },
];

/** The Studio Red workout, identical in all four weeks. */
const studioRedWorkout = (): SeedTemplate => ({
  workoutNumber: 3,
  name: "Workout 3: Studio Red Class",
  workoutType: "class",
  instructions: "Check out your Studio Red class schedule for available times.",
  exercises: [{ exerciseSlug: "studio-red-class" }],
});

export const vasaWeeks: SeedWeek[] = [
  {
    weekNumber: 1,
    name: "Week 1",
    description: null,
    templates: [
      {
        workoutNumber: 1,
        name: "Workout 1: Functional/Free Weight",
        workoutType: "strength",
        instructions: null,
        exercises: [
          { exerciseSlug: "kettlebell-goblet-squat", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "trx-underhand-row", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "box-elevated-push-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "kettlebell-deadlift", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "alternating-kettlebell-overhead-press", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "dumbbell-bent-over-row", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-stair-climber", targetSets: 1, targetDurationMinutes: 20 },
        ],
      },
      {
        workoutNumber: 2,
        name: "Workout 2: Machines",
        workoutType: "machines",
        instructions: null,
        exercises: [
          { exerciseSlug: "leg-press-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "seated-chest-press-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "seated-row-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "glute-drive-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "seated-shoulder-press-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "seated-lat-pulldown", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-incline-treadmill-walk", targetSets: 1, targetDurationMinutes: 20, targetIncline: 12 },
        ],
      },
      studioRedWorkout(),
    ],
  },
  {
    weekNumber: 2,
    name: "Week 2",
    description: null,
    templates: [
      {
        workoutNumber: 1,
        name: "Workout 1: Functional/Free Weight",
        workoutType: "strength",
        instructions: null,
        exercises: [
          { exerciseSlug: "dumbbell-reverse-lunge", targetSets: 3, targetReps: 12, isPerSide: true },
          { exerciseSlug: "dumbbell-single-arm-row-on-bench", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "box-elevated-push-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "single-leg-glute-bridge", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "standing-kettlebell-shoulder-press", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "trx-assisted-pull-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-stair-climber", targetSets: 1, targetDurationMinutes: 20 },
        ],
      },
      {
        workoutNumber: 2,
        name: "Workout 2: Machines",
        workoutType: "machines",
        instructions: null,
        exercises: [
          { exerciseSlug: "hack-squat-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "diamond-push-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "standing-cable-row", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "glute-drive-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "dumbbell-lateral-raise", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "seated-lat-pulldown", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-incline-treadmill-walk", targetSets: 1, targetDurationMinutes: 20, targetIncline: 12 },
        ],
      },
      studioRedWorkout(),
    ],
  },
  {
    weekNumber: 3,
    name: "Week 3",
    description: null,
    templates: [
      {
        workoutNumber: 1,
        name: "Workout 1: Functional/Free Weight",
        workoutType: "strength",
        instructions: null,
        exercises: [
          { exerciseSlug: "kettlebell-goblet-squat", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "trx-underhand-row", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "box-elevated-push-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "kettlebell-deadlift", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "standing-kettlebell-shoulder-press", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "dumbbell-bent-over-row", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-stair-climber", targetSets: 1, targetDurationMinutes: 25 },
        ],
      },
      {
        workoutNumber: 2,
        name: "Workout 2: Machines",
        workoutType: "machines",
        instructions: null,
        exercises: [
          { exerciseSlug: "leg-press-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "seated-chest-press-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "seated-row-machine", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "glute-drive-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "seated-shoulder-press-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "seated-lat-pulldown", targetSets: 3, targetReps: 12 },
          // Sets, reps, and duration are all blank in the source. Nothing is
          // invented; the exercise is listed with no target.
          { exerciseSlug: "cardio-incline-treadmill-walk", targetIncline: 12 },
        ],
      },
      studioRedWorkout(),
    ],
  },
  {
    weekNumber: 4,
    name: "Week 4",
    description: null,
    templates: [
      {
        workoutNumber: 1,
        name: "Workout 1: Functional/Free Weight",
        workoutType: "strength",
        instructions: null,
        exercises: [
          { exerciseSlug: "dumbbell-single-arm-row-on-bench", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "box-elevated-push-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "single-leg-glute-bridge", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "standing-kettlebell-shoulder-press", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "trx-assisted-pull-up", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "cardio-stair-climber", targetSets: 1, targetDurationMinutes: 25 },
        ],
      },
      {
        workoutNumber: 2,
        name: "Workout 2: Machines",
        workoutType: "machines",
        instructions: null,
        exercises: [
          { exerciseSlug: "hack-squat-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "diamond-push-up", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "standing-cable-row", targetSets: 3, targetReps: 12 },
          { exerciseSlug: "glute-drive-machine", targetSets: 4, targetReps: 10 },
          { exerciseSlug: "dumbbell-lateral-raise", targetSets: 4, targetReps: 10 },
          // Sets and reps are blank in the source and stay null.
          { exerciseSlug: "seated-lat-pulldown" },
          { exerciseSlug: "cardio-incline-treadmill-walk", targetSets: 1, targetDurationMinutes: 25, targetIncline: 12 },
        ],
      },
      studioRedWorkout(),
    ],
  },
];

export const vasaProgram = {
  slug: "vasa-4-week",
  name: "VASA Four-Week Fitness Program",
  description:
    "VASA's published four-week plan: three workouts a week — functional/free weight, machines, and a Studio Red class. After Week 4 you start a fresh four-week cycle at Week 1.",
  sourceUrl: SOURCE_URL,
  totalWeeks: 4,
  /**
   * The date the Start Cycle form proposes for a first VASA cycle. It is only
   * a default in the form: no cycle exists until it is created deliberately,
   * with whatever start date is confirmed there.
   */
  defaultFirstStartDate: "2026-08-31",
  weeks: vasaWeeks,
  exercises: vasaExercises,
};
