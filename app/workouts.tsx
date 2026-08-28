"use client";

/**
 * Workout programs: browsing a program, running a workout at the gym, and
 * looking back over what was done.
 *
 * Three screens live here. The dashboard shows the program, its cycles, and
 * the status of every workout in the selected cycle. The active workout screen
 * is built for a phone held one-handed between sets: large targets, almost no
 * typing, and every change saved as it is made. History lists finished
 * workouts and opens any one of them in full.
 *
 * Nothing on the dashboard starts anything. A workout session exists only once
 * Start Workout is pressed, and finishing one is always a separate step.
 */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Profile, amount, localDate, longDate, mediumDate, round } from "./shared";
import {
  MAX_WORKOUT_CALORIES, MAX_WORKOUT_MINUTES, MAX_WORKOUT_NOTES,
  type WorkoutStatus, sessionStatusLabels, startsOnLabel, targetLabel, usesCardio,
  usesDistance, usesReps, usesWeight, weekRangeLabel, workingVolume, workoutStatusLabels,
} from "./workout-shared";

type Cycle = {
  id: number; cycleNumber: number; startDate: string; scheduledEndDate: string;
  status: string; phase: string; recommendedWeek: number | null;
};
type PrescribedExercise = {
  id: number; exerciseId: number; name: string; measurementType: string;
  description: string | null; videoUrl: string | null; equipmentType: string | null;
  targetSets: number | null; targetReps: number | null; targetDurationMinutes: number | null;
  targetIncline: number | null; isPerSide: number; displayOrder: number;
};
type ProgramTemplate = {
  id: number; weekNumber: number; workoutNumber: number; name: string; workoutType: string;
  instructions: string | null; exercises: PrescribedExercise[];
};
type ProgramWeek = { id: number; weekNumber: number; name: string | null; templates: ProgramTemplate[] };
type Program = {
  id: number; slug: string; name: string; description: string | null;
  sourceUrl: string | null; totalWeeks: number; weeks: ProgramWeek[];
};
type WeekSummary = {
  weekNumber: number; name: string | null; range: { start: string; end: string } | null;
  status: WorkoutStatus; progressLabel: string;
  workouts: {
    templateId: number; workoutNumber: number; name: string; workoutType: string;
    status: WorkoutStatus; activeSessionId: number | null;
    sessions: { id: number; status: string; workoutDate: string; completedAt: string | null }[];
  }[];
};
type ProgramFeed = {
  program: Program; cycles: Cycle[]; selectedCycleId: number | null;
  weeks: WeekSummary[]; today: string; defaultFirstStartDate: string | null;
};
type WorkoutSet = {
  id: number; setNumber: number; setType: string; targetReps: number | null; actualReps: number | null;
  weight: number | null; weightUnit: string; durationSeconds: number | null; distance: number | null;
  distanceUnit: string | null; incline: number | null; resistanceLevel: number | null;
  completed: number; notes: string | null;
};
type SessionExercise = {
  id: number; exerciseId: number | null; exerciseNameSnapshot: string; measurementTypeSnapshot: string;
  descriptionSnapshot: string | null; videoUrlSnapshot: string | null;
  targetSetsSnapshot: number | null; targetRepsSnapshot: number | null; targetDurationSnapshot: number | null;
  targetInclineSnapshot: number | null; isPerSideSnapshot: number; displayOrder: number;
  status: string; machineSettings: string | null; equipmentNotes: string | null; exerciseNotes: string | null;
  sets: WorkoutSet[];
};
type Session = {
  id: number; status: string; workoutDate: string; startedAt: string; completedAt: string | null;
  durationMinutes: number | null; caloriesBurned: number | null; perceivedDifficulty: number | null;
  notes: string | null; linkedActivityEntryId: number | null;
  programNameSnapshot: string | null; templateNameSnapshot: string;
  cycleNumberSnapshot: number | null; weekNumberSnapshot: number | null; workoutNumberSnapshot: number | null;
  exercises: SessionExercise[];
};
type Previous = {
  workoutDate: string; machineSettings: string | null; equipmentNotes: string | null;
  topWeight: number | null; bestWeight: number | null;
  sets: { setNumber: number; actualReps: number | null; weight: number | null; weightUnit: string; durationSeconds: number | null; incline: number | null; completed: number }[];
};
type HistoryRow = Session & {
  title: string; plannedExercises: number; completedExercises: number; workingSets: number; volume: number;
};
type Proposal = {
  programId: number; cycleNumber: number; startDate: string; scheduledEndDate: string; totalWeeks: number;
  weeks: { weekNumber: number; start: string; end: string }[];
  previousCycle: { id: number; cycleNumber: number; scheduledEndDate: string } | null;
  incomplete: { weekNumber: number; workoutNumber: number; name: string; status: string }[];
};

const workoutTypeLabels: Record<string, string> = {
  strength: "Functional / free weight", machines: "Machines", class: "Studio class",
  cardio: "Cardio", mixed: "Mixed",
};
/** Minutes are what people think in; the database keeps seconds. */
const toMinutes = (seconds: number | null) => seconds === null ? "" : String(round(seconds / 60));
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

export default function WorkoutsPage({ profile, onActivityChanged }: {
  profile: Profile; onActivityChanged: () => void;
}) {
  const [feed, setFeed] = useState<ProgramFeed | null>(null);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [startingCycle, setStartingCycle] = useState(false);
  const [tab, setTab] = useState<"program" | "history">("program");
  const [reloadKey, setReloadKey] = useState(0);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    let cancelled = false;
    // The previous cycle stays on screen while the next one loads, so the
    // dashboard never blinks back to a spinner on every switch.
    const query = cycleId === null ? "" : `?cycle=${cycleId}`;
    fetch(`/api/workouts/programs${query}`, { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load the program");
      if (cancelled) return;
      setFeed(data);
      setError("");
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the program");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [headers, cycleId, reloadKey]);

  const refresh = useCallback(() => setReloadKey(current => current + 1), []);

  async function startWorkout(templateId: number, cycleForWorkout: number) {
    setError("");
    const response = await fetch("/api/workouts/sessions", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ templateId, cycleId: cycleForWorkout, workoutDate: localDate() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "Unable to start that workout"); return; }
    setActiveSessionId(data.session.id);
  }

  if (activeSessionId !== null) {
    return <ActiveWorkout
      sessionId={activeSessionId} profile={profile}
      onClose={() => { setActiveSessionId(null); refresh(); }}
      onFinished={message => {
        setActiveSessionId(null); refresh(); setNotice(message); onActivityChanged();
      }}
    />;
  }

  const selected = feed?.cycles.find(cycle => cycle.id === feed.selectedCycleId) ?? null;

  return <section className="workout-page">
    <div className="section-heading">
      <div><p className="eyebrow">Training</p><h2>Workout programs</h2></div>
      <span>{profile === "chris" ? "Chris" : "Sarah"}</span>
    </div>

    <div className="workout-tabs" role="tablist" aria-label="Workout sections">
      <button type="button" role="tab" aria-selected={tab === "program"} className={tab === "program" ? "active" : ""} onClick={() => setTab("program")}>Program</button>
      <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
    </div>

    {error && <p className="form-error">{error}</p>}
    {notice && <p className="workout-notice" aria-live="polite">{notice}</p>}

    {tab === "history"
      ? <WorkoutHistory profile={profile} />
      : loading && !feed ? <div className="empty-state">Loading your program…</div>
      : !feed ? <div className="empty-state">No program is available yet.</div>
      : <>
        <article className="workout-program-card">
          <h3>{feed.program.name}</h3>
          {feed.program.description && <p>{feed.program.description}</p>}
          {feed.program.sourceUrl && <a className="workout-source" href={feed.program.sourceUrl} target="_blank" rel="noreferrer">View the published program ↗</a>}
        </article>

        {feed.cycles.length === 0
          ? <div className="workout-empty-cycle">
              <p><strong>No cycle has been started.</strong></p>
              <p>You can browse every week and workout below. Progress begins only when you start a cycle and choose its start date.</p>
              <button type="button" className="primary" onClick={() => setStartingCycle(true)}>Start Cycle 1</button>
            </div>
          : <CycleBar
              cycles={feed.cycles} selected={selected} today={feed.today}
              onSelect={next => setCycleId(next)}
              onStartNew={() => setStartingCycle(true)}
            />}

        <div className="workout-weeks">
          {feed.program.weeks.map(week => {
            const summary = feed.weeks.find(item => item.weekNumber === week.weekNumber);
            return <WeekPanel
              key={week.id} week={week} summary={summary ?? null} cycle={selected}
              recommended={selected?.recommendedWeek === week.weekNumber}
              onStart={templateId => selected && void startWorkout(templateId, selected.id)}
              onResume={sessionId => setActiveSessionId(sessionId)}
            />;
          })}
        </div>
      </>}

    {startingCycle && feed && <StartCycleDialog
      profile={profile} slug={feed.program.slug}
      onClose={() => setStartingCycle(false)}
      onCreated={cycle => {
        setStartingCycle(false);
        setCycleId(cycle.id);
        setNotice(`Cycle ${cycle.cycleNumber} starts ${longDate(cycle.startDate)}.`);
        refresh();
      }}
    />}
  </section>;
}

/** The cycle selector, its dates, and where the calendar says you are. */
function CycleBar({ cycles, selected, today, onSelect, onStartNew }: {
  cycles: Cycle[]; selected: Cycle | null; today: string;
  onSelect: (id: number) => void; onStartNew: () => void;
}) {
  if (!selected) return null;
  const upcoming = selected.phase === "upcoming";
  return <section className="workout-cycle" aria-label="Program cycle">
    <div className="workout-cycle-head">
      <label className="workout-cycle-picker">
        <span className="sr-label">Cycle</span>
        <select value={selected.id} onChange={event => onSelect(Number(event.target.value))}>
          {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>Cycle {cycle.cycleNumber}</option>)}
        </select>
      </label>
      <span className={`workout-chip ${selected.phase}`}>{selected.phase === "upcoming" ? "Upcoming" : selected.phase === "active" ? "Active" : selected.phase === "completed" ? "Completed" : "Archived"}</span>
    </div>
    <p className="workout-cycle-dates">
      {mediumDate(selected.startDate)} – {mediumDate(selected.scheduledEndDate)}
    </p>
    <p className="workout-cycle-state">
      {upcoming
        ? startsOnLabel(selected.startDate)
        : selected.recommendedWeek
          ? `Recommended: Week ${selected.recommendedWeek}${today > selected.scheduledEndDate ? " — this cycle's dates have passed" : ""}`
          : "Browse any week below."}
    </p>
    <button type="button" className="workout-secondary" onClick={onStartNew}>Start new cycle</button>
  </section>;
}

/** One week: its dates, its progress, and the workouts inside it. */
function WeekPanel({ week, summary, cycle, recommended, onStart, onResume }: {
  week: ProgramWeek; summary: WeekSummary | null; cycle: Cycle | null; recommended: boolean;
  onStart: (templateId: number) => void; onResume: (sessionId: number) => void;
}) {
  const [open, setOpen] = useState(recommended || week.weekNumber === 1);
  const status = summary?.status ?? "not_started";
  return <article className={`workout-week${recommended ? " recommended" : ""}`}>
    <button type="button" className="workout-week-head" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <div>
        <p className="eyebrow">{recommended ? "This week" : `Week ${week.weekNumber}`}</p>
        <h3>{week.name ?? `Week ${week.weekNumber}`}</h3>
        {cycle && summary?.range && <span className="workout-week-dates">{weekRangeLabel(cycle.startDate, week.weekNumber)}</span>}
      </div>
      <div className="workout-week-meta">
        <span className={`workout-status ${status}`}>{workoutStatusLabels[status]}</span>
        <small>{summary?.progressLabel ?? "Not started"}</small>
      </div>
      <span aria-hidden="true" className="workout-week-toggle">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="workout-week-body">
      {week.templates.map(template => {
        const progress = summary?.workouts.find(item => item.templateId === template.id) ?? null;
        return <WorkoutPanel key={template.id} template={template} progress={progress} cycle={cycle}
          onStart={() => onStart(template.id)} onResume={onResume} />;
      })}
    </div>}
  </article>;
}

function WorkoutPanel({ template, progress, cycle, onStart, onResume }: {
  template: ProgramTemplate;
  progress: WeekSummary["workouts"][number] | null;
  cycle: Cycle | null;
  onStart: () => void; onResume: (sessionId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = progress?.status ?? "not_started";
  const finished = progress?.sessions.filter(session => session.status === "completed" || session.status === "partial") ?? [];
  return <div className="workout-item">
    <div className="workout-item-head">
      <div>
        <strong>{template.name}</strong>
        <span>{workoutTypeLabels[template.workoutType] ?? template.workoutType} · {template.exercises.length} {template.exercises.length === 1 ? "exercise" : "exercises"}</span>
        {finished.length > 0 && <small>Completed {finished.map(session => mediumDate(session.workoutDate)).join(", ")}</small>}
      </div>
      <span className={`workout-status ${status}`}>{workoutStatusLabels[status]}</span>
    </div>
    <div className="workout-item-actions">
      <button type="button" className="workout-link" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        {open ? "Hide exercises" : "Show exercises"}
      </button>
      {cycle && (progress?.activeSessionId
        ? <button type="button" className="primary workout-start" onClick={() => onResume(progress.activeSessionId as number)}>Resume workout</button>
        : <button type="button" className="primary workout-start" onClick={onStart}>Start workout</button>)}
    </div>
    {open && <ol className="workout-exercise-list">
      {template.exercises.map(exercise => <li key={exercise.id}>
        <div className="workout-exercise-head">
          <strong>{exercise.name}</strong>
          <span>{targetLabel(exercise)}</span>
        </div>
        {exercise.description && <p>{exercise.description}</p>}
        {exercise.videoUrl && <a href={exercise.videoUrl} target="_blank" rel="noreferrer">Watch the video ↗</a>}
      </li>)}
    </ol>}
  </div>;
}

/**
 * Starting a cycle, with everything it will do shown first.
 *
 * The proposed date is only a default. Nothing is created until Start cycle is
 * pressed, and workouts left unfinished in the previous cycle stay exactly
 * where they are.
 */
function StartCycleDialog({ profile, slug, onClose, onCreated }: {
  profile: Profile; slug: string; onClose: () => void; onCreated: (cycle: Cycle) => void;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overlap, setOverlap] = useState(false);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    fetch(`/api/workouts/cycles?slug=${slug}&proposal=1`, { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to prepare a new cycle");
      setProposal(data.proposal);
      setStartDate(data.proposal.startDate);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to prepare a new cycle"));
  }, [headers, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/workouts/cycles", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ slug, startDate, allowOverlap: overlap }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.status === 409) { setError(data.error ?? "Those dates overlap another cycle."); setOverlap(false); return; }
    if (!response.ok) { setError(data.error ?? "Unable to start that cycle"); return; }
    onCreated(data.cycle);
  }

  const weeks = proposal && startDate
    ? proposal.weeks.map(week => ({ ...week, label: weekRangeLabel(startDate, week.weekNumber) }))
    : [];

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cycle-title">
      <div className="modal-head">
        <div><p className="eyebrow">Program</p><h2 id="cycle-title">Start {proposal ? `Cycle ${proposal.cycleNumber}` : "a cycle"}</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      {!proposal ? <div className="empty-state">Working out the next cycle…</div> : <form className="food-form" onSubmit={submit}>
        <label>Start date
          <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required />
          <small>Weeks run Monday to Sunday from this date. Nothing is created until you confirm.</small>
        </label>
        <div className="workout-proposal">
          <p><strong>Cycle {proposal.cycleNumber}</strong> · {startDate ? `${mediumDate(startDate)} – ${mediumDate(weeks[weeks.length - 1]?.end ?? proposal.scheduledEndDate)}` : "Choose a start date"}</p>
          <ul>{weeks.map(week => <li key={week.weekNumber}>Week {week.weekNumber}: {week.label}</li>)}</ul>
        </div>
        {proposal.incomplete.length > 0 && <div className="barcode-notice">
          <span aria-hidden="true">⚠</span>
          <div>
            <strong>{proposal.incomplete.length} workout{proposal.incomplete.length === 1 ? "" : "s"} unfinished in Cycle {proposal.previousCycle?.cycleNumber}</strong>
            <p>They stay available under their original cycle and keep their own week. Finishing one later never counts toward this new cycle.</p>
            <ul className="workout-incomplete">
              {proposal.incomplete.slice(0, 8).map(item => <li key={`${item.weekNumber}-${item.workoutNumber}`}>Week {item.weekNumber}, Workout {item.workoutNumber} — {workoutStatusLabels[item.status as WorkoutStatus] ?? item.status}</li>)}
            </ul>
          </div>
        </div>}
        {error && <>
          <p className="form-error">{error}</p>
          {/^Cycle \d+ already/.test(error) && <label className="checkbox-row">
            <input type="checkbox" checked={overlap} onChange={event => setOverlap(event.target.checked)} />
            <span>Yes, run these cycles at the same time</span>
          </label>}
        </>}
        <button className="primary" disabled={busy || !startDate}>{busy ? "Starting…" : `Start Cycle ${proposal.cycleNumber}`}</button>
      </form>}
    </div>
  </div>;
}

/**
 * The gym screen.
 *
 * One exercise at a time, everything saved as it is entered, and only the
 * fields that apply to the exercise in front of you: no reps on a stair
 * climber, no distance on a squat, no weight on a push-up.
 */
function ActiveWorkout({ sessionId, profile, onClose, onFinished }: {
  sessionId: number; profile: Profile; onClose: () => void; onFinished: (message: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [previous, setPrevious] = useState<Record<string, Previous>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // Held as a number rather than a boolean: the elapsed time is read when
  // Finish is pressed, so nothing consults the clock during a render.
  const [finishing, setFinishing] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workouts/sessions?id=${sessionId}`, { headers }).then(async response => {
      const data = await response.json();
      if (cancelled) return;
      if (!response.ok) { setError(data.error ?? "Unable to load that workout"); return; }
      setSession(data.session);
      setPrevious(data.previous ?? {});
    }).catch(() => { if (!cancelled) setError("Unable to load that workout"); });
    return () => { cancelled = true; };
  }, [headers, sessionId]);

  /** Every save goes through here so the screen can report what it is doing. */
  const save = useCallback(async (url: string, body: Record<string, unknown>, method = "PUT") => {
    setSaveState("saving");
    const response = await fetch(url, {
      method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "That change could not be saved"); setSaveState("idle"); return null; }
    setError(""); setSaveState("saved");
    return data;
  }, [headers]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setSaveState("idle"), 1600);
    return () => clearTimeout(timer);
  }, [saveState]);

  if (!session) {
    return <section className="workout-page">
      {error ? <p className="form-error">{error}</p> : <div className="empty-state">Loading your workout…</div>}
      <button type="button" className="workout-secondary" onClick={onClose}>Back to the program</button>
    </section>;
  }

  const exercise = session.exercises[Math.min(index, session.exercises.length - 1)] ?? null;
  const completedExercises = session.exercises.filter(item => item.status === "completed").length;
  const workingSets = session.exercises.reduce(
    (total, item) => total + item.sets.filter(set => set.setType === "working" && set.completed === 1).length, 0);

  async function patchSet(setId: number, patch: Record<string, unknown>) {
    const result = await save("/api/workouts/sets", { id: setId, ...patch });
    if (!result) return;
    setSession(current => current === null ? current : {
      ...current,
      exercises: current.exercises.map(item => ({
        ...item,
        status: item.sets.some(set => set.id === setId) ? result.exerciseStatus ?? item.status : item.status,
        sets: item.sets.map(set => set.id === setId ? result.set : set),
      })),
    });
  }

  async function addSet(sessionExerciseId: number) {
    const result = await save("/api/workouts/sets", { sessionExerciseId }, "POST");
    if (!result) return;
    setSession(current => current === null ? current : {
      ...current,
      exercises: current.exercises.map(item => item.id === sessionExerciseId
        ? { ...item, sets: [...item.sets, result.set] } : item),
    });
  }

  async function removeSet(setId: number) {
    setSaveState("saving");
    const response = await fetch(`/api/workouts/sets?id=${setId}`, { method: "DELETE", headers });
    if (!response.ok) { setError("That set could not be removed"); setSaveState("idle"); return; }
    setSaveState("saved");
    setSession(current => current === null ? current : {
      ...current,
      exercises: current.exercises.map(item => ({ ...item, sets: item.sets.filter(set => set.id !== setId) })),
    });
  }

  async function patchExercise(exerciseId: number, patch: Record<string, unknown>) {
    const result = await save("/api/workouts/exercises", { id: exerciseId, ...patch });
    if (!result) return;
    setSession(current => current === null ? current : {
      ...current,
      exercises: current.exercises.map(item => item.id === exerciseId ? { ...item, ...result.exercise, sets: item.sets } : item),
    });
  }

  return <section className="workout-page active-workout">
    <header className="active-head">
      <div>
        <p className="eyebrow">{[
          session.cycleNumberSnapshot ? `Cycle ${session.cycleNumberSnapshot}` : "",
          session.weekNumberSnapshot ? `Week ${session.weekNumberSnapshot}` : "",
        ].filter(Boolean).join(" · ")}</p>
        <h2>{session.templateNameSnapshot}</h2>
        <small>{longDate(session.workoutDate)}</small>
      </div>
      <button type="button" className="icon-button" aria-label="Leave this workout" onClick={() => setConfirmLeave(true)}>×</button>
    </header>

    <div className="active-progress">
      <span>{completedExercises} of {session.exercises.length} exercises</span>
      <span>{workingSets} working sets</span>
      <span aria-live="polite" className="active-save">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</span>
    </div>
    {error && <p className="form-error">{error}</p>}

    {exercise === null ? <div className="empty-state">This workout has no exercises to record.</div> : <>
      <ExerciseCard
        exercise={exercise}
        previous={exercise.exerciseId === null ? null : previous[String(exercise.exerciseId)] ?? null}
        onSaveSet={patchSet} onAddSet={addSet} onRemoveSet={removeSet} onSaveExercise={patchExercise}
      />
      <nav className="active-nav" aria-label="Exercises">
        <button type="button" className="workout-secondary" disabled={index === 0} onClick={() => setIndex(current => Math.max(0, current - 1))}>‹ Previous</button>
        <span>{index + 1} / {session.exercises.length}</span>
        <button type="button" className="workout-secondary" disabled={index >= session.exercises.length - 1} onClick={() => setIndex(current => Math.min(session.exercises.length - 1, current + 1))}>Next ›</button>
      </nav>
      <div className="active-jump">
        {session.exercises.map((item, position) => <button key={item.id} type="button"
          className={`active-dot ${item.status}${position === index ? " current" : ""}`}
          aria-label={`Go to ${item.exerciseNameSnapshot}`} aria-current={position === index ? "true" : undefined}
          onClick={() => setIndex(position)}>{position + 1}</button>)}
      </div>
    </>}

    <button type="button" className="primary active-finish"
      onClick={() => setFinishing(Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt)) / 60000)))}>
      Finish workout
    </button>

    {finishing !== null && <FinishWorkoutDialog
      session={session} elapsed={finishing} profile={profile}
      onClose={() => setFinishing(null)}
      onFinished={message => onFinished(message)}
    />}
    {confirmLeave && <div className="modal-backdrop" onMouseDown={() => setConfirmLeave(false)}>
      <div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head"><div><p className="eyebrow">Workout</p><h2>Leave this workout?</h2></div><button onClick={() => setConfirmLeave(false)} aria-label="Close">×</button></div>
        <p className="confirm-help">Everything you have recorded is already saved. The workout stays in progress, so you can resume it from the program whenever you like.</p>
        <div className="scanner-actions">
          <button type="button" className="secondary" onClick={() => setConfirmLeave(false)}>Keep going</button>
          <button type="button" className="primary" onClick={onClose}>Leave it in progress</button>
        </div>
      </div>
    </div>}
  </section>;
}

/** One exercise: what to do, how it went last time, and the set rows. */
function ExerciseCard({ exercise, previous, onSaveSet, onAddSet, onRemoveSet, onSaveExercise }: {
  exercise: SessionExercise; previous: Previous | null;
  onSaveSet: (setId: number, patch: Record<string, unknown>) => void;
  onAddSet: (sessionExerciseId: number) => void;
  onRemoveSet: (setId: number) => void;
  onSaveExercise: (exerciseId: number, patch: Record<string, unknown>) => void;
}) {
  const [showDescription, setShowDescription] = useState(false);
  const measurement = exercise.measurementTypeSnapshot;
  const volume = workingVolume(exercise.sets.map(set => ({
    setType: set.setType, completed: set.completed === 1, actualReps: set.actualReps, weight: set.weight,
  })));

  return <article className="active-exercise">
    <div className="active-exercise-head">
      <div>
        <h3>{exercise.exerciseNameSnapshot}</h3>
        <span>{targetLabel(exercise)}{exercise.isPerSideSnapshot === 1 ? "" : ""}</span>
      </div>
      <span className={`workout-status ${exercise.status}`}>{exercise.status === "pending" ? "Not started" : exercise.status === "partial" ? "Partly done" : exercise.status === "completed" ? "Done" : "Skipped"}</span>
    </div>

    <div className="active-links">
      {exercise.descriptionSnapshot && <button type="button" className="workout-link" aria-expanded={showDescription} onClick={() => setShowDescription(current => !current)}>
        {showDescription ? "Hide instructions" : "Instructions"}
      </button>}
      {exercise.videoUrlSnapshot && <a className="workout-link" href={exercise.videoUrlSnapshot} target="_blank" rel="noreferrer">Video ↗</a>}
    </div>
    {showDescription && exercise.descriptionSnapshot && <p className="active-description">{exercise.descriptionSnapshot}</p>}

    {previous && <div className="active-previous">
      <p className="ai-list-title">Last time · {mediumDate(previous.workoutDate)}</p>
      <p>
        {previous.sets.filter(set => set.completed === 1).map(set => {
          if (usesCardio(measurement)) return set.durationSeconds === null ? "—" : `${round(set.durationSeconds / 60)} min`;
          return `${set.actualReps ?? "—"}${set.weight === null ? "" : ` × ${amount(set.weight)}${set.weightUnit}`}`;
        }).join(" · ") || "Nothing was recorded."}
      </p>
      {previous.bestWeight !== null && <p className="active-best">Best working weight: {amount(previous.bestWeight)} lb</p>}
      {previous.machineSettings && <p className="active-best">Settings: {previous.machineSettings}</p>}
    </div>}

    <div className="active-sets">
      {exercise.sets.length === 0 && <p className="active-empty">
        {measurement === "class" ? "Nothing to record for a class. Add a set if you want to note what you did." : "No sets yet. Add one to start recording."}
      </p>}
      {exercise.sets.map(set => <SetRow key={set.id} set={set} measurement={measurement}
        onSave={patch => onSaveSet(set.id, patch)} onRemove={() => onRemoveSet(set.id)} />)}
    </div>

    <div className="active-exercise-actions">
      <button type="button" className="workout-secondary" onClick={() => onAddSet(exercise.id)}>+ Add set</button>
      <button type="button" className="workout-secondary" onClick={() => onSaveExercise(exercise.id, {
        status: exercise.status === "skipped" ? "pending" : "skipped",
      })}>{exercise.status === "skipped" ? "Un-skip exercise" : "Skip exercise"}</button>
    </div>

    {volume > 0 && <p className="active-volume">Volume so far: {Math.round(volume)} lb</p>}

    <label className="active-notes">Machine or equipment settings
      <input defaultValue={exercise.machineSettings ?? ""} placeholder="e.g. seat 4, pin 6"
        onBlur={event => onSaveExercise(exercise.id, { machineSettings: event.target.value })} />
    </label>
    <label className="active-notes">Notes for this exercise
      <textarea className="meal-textarea active-textarea" rows={2} defaultValue={exercise.exerciseNotes ?? ""}
        maxLength={MAX_WORKOUT_NOTES}
        onBlur={event => onSaveExercise(exercise.id, { exerciseNotes: event.target.value })} />
    </label>
  </article>;
}

/**
 * One set row, showing only the fields that mean something for this exercise.
 *
 * Values are saved when a field is left or when the tick is pressed, so a
 * half-typed number is never written and nothing is lost by locking the phone.
 */
function SetRow({ set, measurement, onSave, onRemove }: {
  set: WorkoutSet; measurement: string;
  onSave: (patch: Record<string, unknown>) => void; onRemove: () => void;
}) {
  const [reps, setReps] = useState(set.actualReps === null ? "" : String(set.actualReps));
  const [weight, setWeight] = useState(set.weight === null ? "" : String(set.weight));
  const [minutes, setMinutes] = useState(toMinutes(set.durationSeconds));
  const [distance, setDistance] = useState(set.distance === null ? "" : String(set.distance));
  const [incline, setIncline] = useState(set.incline === null ? "" : String(set.incline));
  const [resistance, setResistance] = useState(set.resistanceLevel === null ? "" : String(set.resistanceLevel));
  const first = useRef(true);
  useEffect(() => {
    // Keep the boxes in step when the server answers with rounded values.
    if (first.current) { first.current = false; return; }
    setReps(set.actualReps === null ? "" : String(set.actualReps));
    setWeight(set.weight === null ? "" : String(set.weight));
  }, [set.actualReps, set.weight]);

  const done = set.completed === 1;
  return <div className={`set-row${done ? " done" : ""}`}>
    <span className="set-number">{set.setNumber}{set.setType !== "working" ? <small>{set.setType}</small> : null}</span>

    {usesReps(measurement) && <label className="set-field">
      <span>Reps{set.targetReps !== null ? ` / ${set.targetReps}` : ""}</span>
      <input type="number" inputMode="numeric" min="0" step="1" value={reps}
        onChange={event => setReps(event.target.value)}
        onBlur={() => onSave({ actualReps: numberOrNull(reps) })} />
    </label>}

    {usesWeight(measurement) && <label className="set-field">
      <span>Weight (lb)</span>
      <input type="number" inputMode="decimal" min="0" step="0.5" value={weight}
        onChange={event => setWeight(event.target.value)}
        onBlur={() => onSave({ weight: numberOrNull(weight) })} />
    </label>}

    {usesCardio(measurement) && <>
      <label className="set-field">
        <span>Minutes</span>
        <input type="number" inputMode="decimal" min="0" step="1" value={minutes}
          onChange={event => setMinutes(event.target.value)}
          onBlur={() => onSave({ durationSeconds: minutes.trim() === "" ? null : Number(minutes) * 60 })} />
      </label>
      {usesDistance(measurement) && <label className="set-field">
        <span>Distance (mi)</span>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={distance}
          onChange={event => setDistance(event.target.value)}
          onBlur={() => onSave({ distance: numberOrNull(distance), distanceUnit: "mi" })} />
      </label>}
      <label className="set-field">
        <span>Incline %</span>
        <input type="number" inputMode="decimal" min="0" step="0.5" value={incline}
          onChange={event => setIncline(event.target.value)}
          onBlur={() => onSave({ incline: numberOrNull(incline) })} />
      </label>
      <label className="set-field">
        <span>Level</span>
        <input type="number" inputMode="decimal" min="0" step="1" value={resistance}
          onChange={event => setResistance(event.target.value)}
          onBlur={() => onSave({ resistanceLevel: numberOrNull(resistance) })} />
      </label>
    </>}

    <button type="button" className={`set-complete${done ? " done" : ""}`}
      aria-pressed={done} aria-label={done ? `Set ${set.setNumber} completed` : `Complete set ${set.setNumber}`}
      onClick={() => onSave({
        completed: !done,
        // The visible numbers are sent with the tick, so a set is never marked
        // done with a value the box no longer shows.
        ...(usesReps(measurement) ? { actualReps: numberOrNull(reps) } : {}),
        ...(usesWeight(measurement) ? { weight: numberOrNull(weight) } : {}),
        ...(usesCardio(measurement) ? { durationSeconds: minutes.trim() === "" ? null : Number(minutes) * 60 } : {}),
      })}>✓</button>
    <button type="button" className="set-remove" aria-label={`Remove set ${set.setNumber}`} onClick={onRemove}>×</button>
  </div>;
}

/** Finishing: completed or partial, with the numbers the diary will receive. */
function FinishWorkoutDialog({ session, elapsed, profile, onClose, onFinished }: {
  session: Session; elapsed: number; profile: Profile; onClose: () => void; onFinished: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement | null>(null);
  const planned = session.exercises.length;
  const completed = session.exercises.filter(exercise => exercise.status === "completed").length;
  const workingSets = session.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(set => set.setType === "working" && set.completed === 1).length, 0);
  /**
   * Completed and Partial are the same save with a different status, so both
   * buttons read the one form rather than duplicating it.
   */
  async function finish(action: "complete" | "partial") {
    const element = form.current;
    if (!element || !element.reportValidity()) return;
    setBusy(true); setError("");
    const fields = new FormData(element);
    const optional = (name: string) => String(fields.get(name) ?? "").trim() === "" ? null : Number(fields.get(name));
    const response = await fetch("/api/workouts/sessions", {
      method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
      body: JSON.stringify({
        id: session.id, action,
        durationMinutes: Number(fields.get("durationMinutes") || elapsed),
        caloriesBurned: optional("caloriesBurned"),
        perceivedDifficulty: optional("perceivedDifficulty"),
        notes: fields.get("notes"),
        workoutDate: fields.get("workoutDate"),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Unable to finish that workout"); return; }
    onFinished(action === "complete"
      ? "Workout completed and added to your activity diary."
      : "Workout saved as partial and added to your activity diary.");
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="finish-title">
      <div className="modal-head">
        <div><p className="eyebrow">Workout</p><h2 id="finish-title">Finish workout</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="coming-soon">
        <span>✓</span>
        <div>
          <strong>{completed} of {planned} exercises · {workingSets} working sets</strong>
          <p>One entry will be added to your activity diary for this workout. Calories burned stay informational and never change your food allowance.</p>
        </div>
      </div>
      <form ref={form} className="food-form" onSubmit={event => { event.preventDefault(); void finish("complete"); }}>
        <div className="form-grid">
          <label>Date<input name="workoutDate" type="date" defaultValue={session.workoutDate} required /></label>
          <label>Minutes<input name="durationMinutes" type="number" min="1" max={MAX_WORKOUT_MINUTES} step="1" defaultValue={session.durationMinutes ?? elapsed} required /></label>
          <label>Calories burned (optional)<input name="caloriesBurned" type="number" min="0" max={MAX_WORKOUT_CALORIES} step="1" defaultValue={session.caloriesBurned ?? ""} /></label>
          <label>Difficulty 1-10 (optional)<input name="perceivedDifficulty" type="number" min="1" max="10" step="1" defaultValue={session.perceivedDifficulty ?? ""} /></label>
        </div>
        <label>Workout notes (optional)
          <textarea name="notes" className="meal-textarea active-textarea" rows={3} maxLength={MAX_WORKOUT_NOTES} defaultValue={session.notes ?? ""} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="scanner-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => void finish("partial")}>Save as partial</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Mark completed"}</button>
        </div>
      </form>
    </div>
  </div>;
}

/** Finished workouts, filterable, with the full detail of any one of them. */
function WorkoutHistory({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [status, setStatus] = useState("");
  const [week, setWeek] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (week) query.set("week", week);
    fetch(`/api/workouts/sessions?${query.toString()}`, { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load your workout history");
      if (!cancelled) { setRows(data.sessions ?? []); setError(""); }
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load your workout history"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [headers, status, week]);

  return <div className="workout-history">
    <div className="workout-filters">
      <label>Status
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All</option>
          <option value="completed">Completed</option>
          <option value="partial">Partial</option>
          <option value="in_progress">In progress</option>
          <option value="abandoned">Abandoned</option>
        </select>
      </label>
      <label>Week
        <select value={week} onChange={event => setWeek(event.target.value)}>
          <option value="">All</option>
          {[1, 2, 3, 4].map(number => <option key={number} value={number}>Week {number}</option>)}
        </select>
      </label>
    </div>
    {error && <p className="form-error">{error}</p>}
    {loading ? <div className="empty-state">Loading your history…</div>
      : rows.length === 0 ? <div className="empty-state">No workouts match those filters yet.</div>
      : <div className="workout-history-list">
        {rows.map(row => <button key={row.id} type="button" className="workout-history-row" onClick={() => setOpenId(row.id)}>
          <div>
            <strong>{row.templateNameSnapshot}</strong>
            <span>{row.title}</span>
            <small>{mediumDate(row.workoutDate)} · {row.completedExercises}/{row.plannedExercises} exercises · {row.workingSets} sets{row.volume > 0 ? ` · ${row.volume} lb volume` : ""}</small>
          </div>
          <span className={`workout-status ${row.status}`}>{sessionStatusLabels[row.status as keyof typeof sessionStatusLabels] ?? row.status}</span>
        </button>)}
      </div>}
    {openId !== null && <SessionDetail sessionId={openId} profile={profile} onClose={() => setOpenId(null)} />}
  </div>;
}

/** One past workout in full. Built entirely from its own snapshots. */
function SessionDetail({ sessionId, profile, onClose }: { sessionId: number; profile: Profile; onClose: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    fetch(`/api/workouts/sessions?id=${sessionId}`, { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load that workout");
      setSession(data.session); setVolume(data.volume ?? 0);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load that workout"));
  }, [headers, sessionId]);

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
      <div className="modal-head">
        <div><p className="eyebrow">Workout</p><h2>{session?.templateNameSnapshot ?? "Workout"}</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!session ? <div className="empty-state">Loading…</div> : <>
        <dl className="product-meta">
          <div><dt>Program</dt><dd>{session.programNameSnapshot ?? "—"}</dd></div>
          <div><dt>Position</dt><dd>{[
            session.cycleNumberSnapshot ? `Cycle ${session.cycleNumberSnapshot}` : "",
            session.weekNumberSnapshot ? `Week ${session.weekNumberSnapshot}` : "",
            session.workoutNumberSnapshot ? `Workout ${session.workoutNumberSnapshot}` : "",
          ].filter(Boolean).join(", ") || "—"}</dd></div>
          <div><dt>Date</dt><dd>{mediumDate(session.workoutDate)}</dd></div>
          <div><dt>Status</dt><dd>{sessionStatusLabels[session.status as keyof typeof sessionStatusLabels] ?? session.status}</dd></div>
          <div><dt>Duration</dt><dd>{session.durationMinutes === null ? "—" : `${amount(session.durationMinutes)} min`}</dd></div>
          <div><dt>Calories burned</dt><dd>{session.caloriesBurned === null ? "—" : Math.round(session.caloriesBurned)}</dd></div>
          <div><dt>Volume</dt><dd>{volume > 0 ? `${volume} lb` : "—"}</dd></div>
          <div><dt>Completed</dt><dd>{session.completedAt ? mediumDate(session.completedAt.slice(0, 10)) : "—"}</dd></div>
        </dl>
        {session.notes && <p className="page-help">{session.notes}</p>}
        <ol className="session-detail-list">
          {session.exercises.map(exercise => <li key={exercise.id}>
            <div className="session-detail-head">
              <strong>{exercise.exerciseNameSnapshot}</strong>
              <span>{targetLabel(exercise)}</span>
            </div>
            {exercise.status === "skipped" ? <p className="active-empty">Skipped</p> : <ul className="session-detail-sets">
              {exercise.sets.map(set => <li key={set.id}>
                <span>Set {set.setNumber}</span>
                <span>{usesCardio(exercise.measurementTypeSnapshot)
                  ? [
                      set.durationSeconds === null ? "" : `${round(set.durationSeconds / 60)} min`,
                      set.distance === null ? "" : `${amount(set.distance)} ${set.distanceUnit ?? "mi"}`,
                      set.incline === null ? "" : `${amount(set.incline)}% incline`,
                      set.resistanceLevel === null ? "" : `level ${amount(set.resistanceLevel)}`,
                    ].filter(Boolean).join(" · ") || "—"
                  : `${set.actualReps ?? "—"} reps${set.weight === null ? "" : ` × ${amount(set.weight)} ${set.weightUnit}`}`}</span>
                <span>{set.completed === 1 ? "✓" : "—"}</span>
              </li>)}
              {exercise.sets.length === 0 && <li><span>No sets recorded</span></li>}
            </ul>}
            {exercise.machineSettings && <p className="active-best">Settings: {exercise.machineSettings}</p>}
            {exercise.exerciseNotes && <p className="active-best">{exercise.exerciseNotes}</p>}
          </li>)}
        </ol>
      </>}
    </div>
  </div>;
}
