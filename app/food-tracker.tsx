"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExportPanel from "./export-panel";
import { exportSections as allExportSections } from "./export-shared";
import {
  type AddKind, type FoodValues,
  copyOfEntry, isPastDate, pastDateWarning, savedFoodFrom,
} from "./diary-actions";
import {
  type CarbTotals, type FatBreakdown, type FatTotals,
  type NetCarbGoals, type NutritionAverages, type NutritionRow,
  CALORIE_SHARE_NOTE, CURRENT_GOALS_NOTE, UNKNOWN_FAT_LABEL,
  aggregateCarbs, aggregateFat, emptyFatTotals,
  fatCoverageNote, fatSubtypeKeys, fatSubtypeLabels, fatSubtypeShortLabels, goalContext,
  gramsOrUnknown, hasFatDetail, netCarbGoalLabel, netCarbGoalsFrom, netCarbProgress,
  nutritionRows, readNetCarbGoals, unclassifiedFat,
} from "./nutrition";
import {
  type Profile, addDays, amount, lastCompleteDays, localDate, longDate, mediumDate,
  profileNames, round, shortDate, weekdayLabel, whole,
} from "./shared";
import WeightChart from "./weight-chart";
import WorkoutsPage from "./workouts";

type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
/** A saved diary entry. The fat subtypes are null on anything logged before the breakdown existed. */
type Entry = { id: number; eatenOn: string; meal: Meal; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number } & FatBreakdown;
type WaterEntry = { id: number; drankOn: string; ounces: number };
type ExerciseEntry = { id: number; exercisedOn: string; activity: string; minutes: number; calories: number; comments: string };
/** One activity within a day, as the Reports feed returns it. */
type ActivitySession = { activity: string; minutes: number; calories: number; comments: string };
type WeightEntry = { id: number; weighedOn: string; pounds: number; note: string };
type StepEntry = { id: number; steppedOn: string; steps: number };
type JournalEntry = { id: number; entryOn: string; body: string; source: string; updatedAt: string };
/** A saved food. Its nutrition, fat subtypes included, is for one full serving. */
type Food = { id: number; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; barcode?: string | null } & FatBreakdown;
/** Prefill for the Add Food form. Missing nutrition stays undefined so the field renders empty. */
type Draft = { id?: number; name: string; serving: string; calories?: number; protein?: number; fat?: number; carbs?: number; fiber?: number; barcode?: string | null } & Partial<FatBreakdown>;
type Source = "manual" | "saved" | "barcode" | "ai" | "copy";
type MealEstimate = {
  foodName: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number;
  assumptions: string[]; confidence: string; warnings: string[];
} & FatBreakdown;
/** One piece of a described workout, with the MET the server calculated it from. */
type ActivitySegment = { name: string; minutes: number; met: number; intensity: string; assumptions: string; calories: number };
type ActivityEstimate = {
  activityName: string; totalMinutes: number; totalCalories: number; comments: string;
  segments: ActivitySegment[]; assumptions: string[]; confidence: string; warnings: string[];
  weight: { pounds: number; weighedOn: string; fallback: boolean }; formula: string;
};
type ScannedProduct = {
  barcode: string; name: string; brand: string; serving: string; servingDescription: string;
  servingAmount: number | null; servingUnit: string; servingBasis: "serving" | "100g"; packageSize: string;
  calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null;
  /** Subtypes Open Food Facts had no figure for. Never turned into a zero. */
  missingFatDetail: string[];
  missing: string[]; source: string; attribution: string;
} & FatBreakdown;
/**
 * `saturatedFat` is the one optional goal: null means none has been set.
 *
 * The net-carb goal is a range. `netCarbs` is kept as the maximum, which is
 * what the single goal has always meant, so anything still reading that one
 * field reads the ceiling rather than nothing.
 */
type Goals = { calories: number; protein: number; fat: number; netCarbs: number; netCarbsMin: number; netCarbsMax: number; saturatedFat: number | null; fiber: number; waterOunces: number; waterShortcutOne: number; waterShortcutTwo: number; waterShortcutThree: number };
type View = "diary" | "foods" | "reports" | "calendar" | "weight" | "journal" | "workouts";
type CalendarDay = {
  date: string; calories: number; items: number; goalCalories: number; goalSource: "saved" | "current";
  remaining: number; status: "none" | "under" | "over" | "way-over";
  exerciseMinutes: number; exerciseCalories: number; sessions: number; activities: string;
  steps: number; hasMovement: boolean; hasData: boolean;
};
type ReportDay = { date: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number; items: number; exerciseMinutes: number; exerciseCalories: number; sessions: number; activities: string; movement?: ActivitySession[]; steps: number | null; fatDetail?: FatTotals };
type ReportTotals = { calories: number; exerciseMinutes: number; exerciseCalories: number; sessions: number; steps: number; daysInRange: number; daysWithFood: number; daysWithExercise: number; daysWithSteps: number; fatDetail?: FatTotals };
/** Averages over the days holding at least one food entry, from the reports feed. */
type ReportNutrition = { recordedDays: number; averages: NutritionAverages; subtypeDays: Partial<Record<string, number>> };
/** The goals in force now. `saturatedFat` is null when none has been set. */
type ReportGoals = { calories: number; protein: number; fat: number; netCarbs: number; netCarbsMin?: number; netCarbsMax?: number; saturatedFat: number | null; fiber: number; waterOunces: number };
type ReportAverages = { caloriesPerDay: number; caloriesPerLoggedDay: number; exerciseMinutesPerDay: number; stepsPerRecordedDay: number };

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const defaultGoals: Goals = { calories: 1600, protein: 110, fat: 105, netCarbs: 25, netCarbsMin: 0, netCarbsMax: 25, saturatedFat: null, fiber: 25, waterOunces: 64, waterShortcutOne: 6, waterShortcutTwo: 8, waterShortcutThree: 12 };
const views: { id: View; label: string; title: string; eyebrow: string }[] = [
  { id: "diary", label: "Diary", title: "Nourish", eyebrow: "Daily Food Tracker" },
  { id: "foods", label: "My Foods", title: "My Foods", eyebrow: "Reusable entries" },
  { id: "calendar", label: "Calendar", title: "Calendar", eyebrow: "Day by day" },
  { id: "reports", label: "Reports", title: "Reports", eyebrow: "Calories & movement" },
  { id: "weight", label: "Weight", title: "Weight", eyebrow: "Your weight log" },
  { id: "journal", label: "Journal", title: "Journal", eyebrow: "Daily recap" },
  { id: "workouts", label: "Workouts", title: "Workouts", eyebrow: "Programs & training" },
];
const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"];
/** Sensible starting meal when the Add food button does not know which one. */
function defaultMealForNow(): Meal {
  const hour = new Date().getHours();
  if (hour < 10) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snacks";
}
const statusLabels: Record<CalendarDay["status"], string> = {
  none: "Nothing logged", under: "Under goal", over: "Over goal", "way-over": "More than 500 over",
};
const nutritionLabels: Record<string, string> = {
  calories: "Calories", protein: "Protein", fat: "Fat", carbs: "Total carbs", fiber: "Fiber",
  ...fatSubtypeLabels,
};
/** An empty number input must stay empty, so a null prefill becomes undefined. */
const fieldValue = (value: number | null | undefined) => value ?? undefined;
const barcodeDigits = (value: string) => value.replace(/\D/g, "");
function monthKey(date: string) { return date.slice(0, 7); }
function shiftMonth(month: string, step: number) {
  const [year, index] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, index - 1 + step, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) { return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }); }

/**
 * The fat subtypes as indented plain-text lines, for the copied day summary.
 *
 * Nothing is produced when no food that day recorded a breakdown, so the
 * compact summary is unchanged for anyone who is not tracking subtypes.
 */
function fatBreakdownLines(totals: FatTotals) {
  if (!hasFatDetail(totals)) return [];
  const lines = fatSubtypeKeys.map(key => {
    const value = totals.subtotals[key];
    const partial = value !== null && totals.missing[key] > 0 ? ` (from ${totals.known[key]} of ${totals.records} foods)` : "";
    return `  ${fatSubtypeShortLabels[key]}: ${value === null ? UNKNOWN_FAT_LABEL : `${amount(value)}g`}${partial}`;
  });
  const other = unclassifiedFat(totals);
  if (other !== null) lines.push(`  Unclassified: ${amount(other)}g`);
  return lines;
}

export default function FoodTracker() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [steps, setSteps] = useState<StepEntry | null>(null);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [loading, setLoading] = useState(true);
  // `locked` is true when the meal is already known, e.g. the + on a meal card.
  // `date` travels with the target rather than being read from `date` above,
  // so a copy to today lands on today even while a past day is on screen.
  const [addTarget, setAddTarget] = useState<{ meal: Meal; locked: boolean; date: string; prefill?: FoodValues; copiedFrom?: string } | null>(null);
  // Set while the warning about a past day is on screen. Nothing is opened and
  // nothing is written until it is answered.
  const [pendingAdd, setPendingAdd] = useState<{ kind: AddKind; date: string; meal: Meal; locked: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseEntry | null>(null);
  // Bumped when My Foods changes, so an open Add Food form reloads its picker.
  const [savedFoodsVersion, setSavedFoodsVersion] = useState(0);
  const [view, setView] = useState<View>("diary");
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");
  const [fatDetailOpen, setFatDetailOpen] = useState(false);
  const [carbDetailOpen, setCarbDetailOpen] = useState(false);
  // Bumped on every copy so the same confirmation can be shown twice running.
  const [copyNote, setCopyNote] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("foodTrackerProfile");
    if (saved === "chris" || saved === "sarah") setProfile(saved);
    else setLoading(false);
  }, []);

  const headers = useMemo((): Record<string, string> => {
    if (!profile) return {};
    return { "x-food-tracker-profile": profile };
  }, [profile]);

  async function loadDay(day: string) {
    if (!profile) return;
    setLoading(true);
    try {
      const [foodResponse, waterResponse, exerciseResponse, stepsResponse] = await Promise.all([
        fetch(`/api/entries?date=${day}`, { headers }),
        fetch(`/api/water?date=${day}`, { headers }),
        fetch(`/api/exercise?date=${day}`, { headers }),
        fetch(`/api/steps?date=${day}`, { headers }),
      ]);
      const foodData = await foodResponse.json();
      const waterData = await waterResponse.json();
      const exerciseData = await exerciseResponse.json();
      const stepsData = await stepsResponse.json();
      if (!foodResponse.ok) throw new Error(foodData.error ?? "Unable to load entries");
      if (!waterResponse.ok) throw new Error(waterData.error ?? "Unable to load water");
      if (!exerciseResponse.ok) throw new Error(exerciseData.error ?? "Unable to load exercise");
      if (!stepsResponse.ok) throw new Error(stepsData.error ?? "Unable to load steps");
      setEntries(foodData.entries ?? []);
      setWater(waterData.entries ?? []);
      setExercise(exerciseData.entries ?? []);
      setSteps(stepsData.entry ?? null);
      setGoals({ ...defaultGoals, ...(foodData.goals ?? {}) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load this day"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadDay(date); }, [date, profile]);
  useEffect(() => {
    if (!copyNote) return;
    const timer = setTimeout(() => setCopyNote(null), 2500);
    return () => clearTimeout(timer);
  }, [copyNote]);

  const totals = useMemo(() => entries.reduce((sum, item) => ({
    calories: sum.calories + item.calories, protein: sum.protein + item.protein,
    fat: sum.fat + item.fat, carbs: sum.carbs + item.carbs, fiber: sum.fiber + item.fiber,
    netCarbs: sum.netCarbs + Math.max(0, item.carbs - item.fiber),
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 }), [entries]);
  /**
   * The day's fat, subtype by subtype, from the one shared aggregation the
   * reports and both PDFs use. Total fat above is unaffected by it.
   */
  const fatDetail = useMemo(() => aggregateFat(entries), [entries]);
  /** The day's carbohydrates, from the one shared aggregation. */
  const carbDetail = useMemo(() => aggregateCarbs(entries), [entries]);
  /** The configured net-carb range, tolerant of goals saved before it existed. */
  const netCarbGoals = useMemo(() => netCarbGoalsFrom(goals), [goals]);
  const netCarbStanding = useMemo(() => netCarbProgress(carbDetail.netCarbs, netCarbGoals), [carbDetail.netCarbs, netCarbGoals]);
  const waterTotal = water.reduce((sum, item) => sum + item.ounces, 0);
  const exerciseMinutes = exercise.reduce((sum, item) => sum + item.minutes, 0);
  const exerciseCalories = exercise.reduce((sum, item) => sum + item.calories, 0);


  /** Plain-text version of the numbers on this screen, for pasting elsewhere. */
  function dayReport() {
    const over = totals.calories - goals.calories;
    const lines = [
      longDate(date),
      "",
      `Calories: ${Math.round(totals.calories)} of ${goals.calories} (${over > 0 ? `${Math.round(over)} over` : `${Math.round(-over)} remaining`})`,
      `Total carbs: ${round(totals.carbs)}g`,
      `Net carbs: ${round(totals.netCarbs)}g of ${netCarbGoalLabel(netCarbGoals)} — ${netCarbStanding.summary}`,
      `Protein: ${round(totals.protein)}g of ${goals.protein}g`,
      `Fat: ${round(totals.fat)}g of ${goals.fat}g`,
      // Indented under Fat, and only when something actually recorded a
      // breakdown, so the copied day stays as short as it always was.
      ...fatBreakdownLines(fatDetail),
      `Fiber: ${round(totals.fiber)}g of ${goals.fiber}g`,
      "",
      `Activity: ${round(exerciseMinutes)} minutes${exerciseCalories > 0 ? ` · ${Math.round(exerciseCalories)} calories burned` : ""}`,
    ];
    if (exercise.length === 0) lines.push("- Nothing logged");
    else for (const item of exercise) {
      lines.push(`- ${item.activity}: ${round(item.minutes)} min${item.calories > 0 ? `, ${Math.round(item.calories)} cal` : ""}`);
      // Comments are indented under their activity so a long gym note stays
      // readable when the whole day is pasted somewhere else.
      if (item.comments.trim()) for (const line of item.comments.split("\n")) lines.push(`  ${line}`);
    }
    lines.push("", `Steps: ${steps ? whole(steps.steps) : "not recorded"}`);
    lines.push("", `Hydration: ${amount(waterTotal)} of ${goals.waterOunces} oz`);
    return lines.join("\n");
  }

  async function copyDay() {
    const text = dayReport();
    const note = (result: string) => setCopyNote(current => ({ id: (current?.id ?? 0) + 1, text: result }));
    try {
      await navigator.clipboard.writeText(text);
      note("Copied.");
      return;
    } catch {
      // iPhone Safari refuses the clipboard API outside a secure context and
      // in some in-app browsers, so fall back to the older selection copy.
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    document.body.removeChild(area);
    note(copied ? "Copied." : "Copying was blocked by this browser.");
  }

  function selectProfile(next: Profile) {
    window.localStorage.setItem("foodTrackerProfile", next);
    setEntries([]); setWater([]); setExercise([]); setSteps(null); setGoals(defaultGoals); setProfile(next);
  }
  function shiftDate(days: number) { setDate(addDays(date, days)); }

  /**
   * Opens the Add Food form, or asks first when the diary is showing a day
   * that has already passed.
   *
   * Today is read from the clock at the moment of the tap rather than from a
   * value captured at render, so a page left open across midnight warns about
   * the day that has just become yesterday instead of staying silent.
   */
  function requestAddFood(meal: Meal, locked: boolean) {
    const today = localDate();
    if (isPastDate(date, today)) { setPendingAdd({ kind: "food", date, meal, locked }); return; }
    setAddTarget({ meal, locked, date });
  }
  function requestAddExercise() {
    const today = localDate();
    if (isPastDate(date, today)) { setPendingAdd({ kind: "exercise", date, meal: defaultMealForNow(), locked: false }); return; }
    setExerciseOpen(true);
  }
  /** "Yes, add to <day>" — carry on into the normal form, on that same day. */
  function confirmPastAdd() {
    if (!pendingAdd) return;
    const target = pendingAdd;
    setPendingAdd(null);
    if (target.kind === "food") setAddTarget({ meal: target.meal, locked: target.locked, date: target.date });
    else setExerciseOpen(true);
  }
  /**
   * "No, go to today" — the add is abandoned and the diary moves to today.
   *
   * No form is opened and nothing is written, so there is never a half-started
   * entry left behind. The date change reloads the day through the effect that
   * already watches it, so no browser reload is needed.
   */
  function cancelPastAdd() {
    setPendingAdd(null);
    setAddTarget(null);
    setDate(localDate());
  }
  async function removeEntry(id: number) {
    const response = await fetch(`/api/entries?id=${id}`, { method: "DELETE", headers });
    if (response.ok) setEntries(current => current.filter(item => item.id !== id));
  }
  async function addWater(ounces: number) {
    const response = await fetch("/api/water", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ drankOn: date, ounces }),
    });
    const data = await response.json();
    if (response.ok) setWater(current => [...current, data.entry]);
    else setMessage(data.error ?? "Unable to add water");
  }
  async function removeWater(id: number) {
    const response = await fetch(`/api/water?id=${id}`, { method: "DELETE", headers });
    if (response.ok) setWater(current => current.filter(item => item.id !== id));
  }
  async function removeExercise(id: number) {
    const response = await fetch(`/api/exercise?id=${id}`, { method: "DELETE", headers });
    if (response.ok) setExercise(current => current.filter(item => item.id !== id));
  }

  if (!profile) return <ProfileChooser onSelect={selectProfile} />;

  const active = views.find(item => item.id === view) ?? views[0];

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-refresh" role="button" tabIndex={0} aria-label="Refresh Nourish"
        title="Refresh Nourish"
        onClick={() => window.location.reload()}
        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); window.location.reload(); } }}>
        <div className="brand-mark">N</div>
        <div><p className="eyebrow">{active.eyebrow}</p><h1>{active.title}</h1></div>
      </div>
      <button className="profile-button" onClick={() => { window.localStorage.removeItem("foodTrackerProfile"); setProfile(null); }} aria-label="Switch profile">
        <span>{profileNames[profile].charAt(0)}</span>{profileNames[profile]}
      </button>
      <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button>
    </header>
    <nav className="view-nav" aria-label="Sections">
      {views.map(item => <button key={item.id} type="button" className={item.id === view ? "active" : ""} aria-current={item.id === view ? "page" : undefined} onClick={() => setView(item.id)}>{item.label}</button>)}
    </nav>
    {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}

    {view === "foods" && <MyFoodsPage profile={profile} onFoodsChanged={() => setSavedFoodsVersion(current => current + 1)} />}
    {view === "calendar" && <CalendarPage profile={profile} onOpenDay={date => { setDate(date); setView("diary"); }} />}
    {view === "reports" && <ReportsPage profile={profile} />}
    {view === "weight" && <WeightPage profile={profile} />}
    {view === "journal" && <JournalPage profile={profile} />}
    {/* A finished workout writes one activity entry, so the day is reloaded to
        pick it up rather than left showing the diary as it was. */}
    {view === "workouts" && <WorkoutsPage profile={profile} onActivityChanged={() => void loadDay(date)} />}

    {view === "diary" && <>
      <section className="date-nav" aria-label="Choose tracking date">
        <button onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button>
        <button className="date-button" onClick={() => setDate(localDate())}>
          <strong>{date === localDate() ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}</strong>
          <span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
        </button>
        <button onClick={() => shiftDate(1)} aria-label="Next day">›</button>
      </section>
      <section className="summary-card">
        <div className="calorie-ring" style={{ "--progress": `${Math.min(100, totals.calories / goals.calories * 100)}%` } as React.CSSProperties}><div><strong>{Math.round(totals.calories)}</strong><span>of {goals.calories}</span></div></div>
        <div className="summary-copy"><span>CALORIES</span><strong>{Math.max(0, Math.round(goals.calories - totals.calories))} remaining</strong><small>{totals.calories > goals.calories ? `${Math.round(totals.calories - goals.calories)} over goal` : "You’re on track"}</small></div>
      </section>
      <CarbCard totals={carbDetail} goals={netCarbGoals} standing={netCarbStanding} onOpen={() => setCarbDetailOpen(true)} />
      <section className="macro-grid">
        <Macro label="Protein" value={round(totals.protein)} goal={goals.protein} color="coral" />
        <Macro label="Fat" value={round(totals.fat)} goal={goals.fat} color="gold"
          onOpen={() => setFatDetailOpen(true)} openLabel="Show today's fat breakdown" />
        <Macro label="Fiber" value={round(totals.fiber)} goal={goals.fiber} color="green" />
      </section>
      <div className="copy-day">
        <button type="button" onClick={() => void copyDay()}>⧉ Copy this day</button>
        <small aria-live="polite">{copyNote?.text ?? ""}</small>
      </div>
      <section className="exercise-card">
        <div className="exercise-heading"><div className="exercise-icon">↗</div><div><p className="eyebrow">Movement</p><h2>{round(exerciseMinutes)} <small>minutes</small></h2></div><button onClick={() => requestAddExercise()}>+ Add exercise</button></div>
        <p className="exercise-summary">{exerciseCalories > 0 ? `${Math.round(exerciseCalories)} estimated calories burned` : exercise.length > 0 ? "Exercise logged for today" : "No exercise logged yet"}</p>
        {exercise.length > 0 && <div className="exercise-history">{exercise.map(item => <div key={item.id}>
          <span>
            <strong>{item.activity}</strong>
            <small>{round(item.minutes)} min{item.calories > 0 ? ` · ${Math.round(item.calories)} cal` : ""}</small>
            {item.comments.trim() && <ActivityComment text={item.comments} />}
          </span>
          <button onClick={() => setEditingExercise(item)} aria-label={`Edit ${item.activity}`}>✎</button>
          <button onClick={() => void removeExercise(item.id)} aria-label={`Remove ${item.activity}`}>×</button>
        </div>)}</div>}
      </section>
      <StepsCard key={`${profile}:${date}`} date={date} profile={profile} entry={steps}
        onSaved={entry => setSteps(entry)} onRemoved={() => setSteps(null)} onError={setMessage} />
      <section className="water-card">
        <div className="water-heading"><div className="water-drop">◒</div><div><p className="eyebrow">Hydration</p><h2>{amount(waterTotal)} <small>of {goals.waterOunces} oz</small></h2></div></div>
        <div className="water-progress"><i style={{ width: `${Math.min(100, waterTotal / goals.waterOunces * 100)}%` }} /></div>
        <div className="water-buttons">
          {[goals.waterShortcutOne, goals.waterShortcutTwo, goals.waterShortcutThree].map((ounces, index) => <button key={index} onClick={() => void addWater(ounces)}>+ {amount(ounces)} oz</button>)}
          <button onClick={() => setCustomWaterOpen(true)}>+ Other</button>
        </div>
        {water.length > 0 && <div className="water-history">{water.map(item => <button key={item.id} onClick={() => void removeWater(item.id)} title="Remove this water entry">{amount(item.ounces)} oz ×</button>)}</div>}
      </section>
      <section className="meals-section"><div className="section-heading"><div><p className="eyebrow">Your day</p><h2>Meals</h2></div><span>{entries.length} {entries.length === 1 ? "item" : "items"}</span></div>
        {loading ? <div className="empty-state">Loading your day…</div> : meals.map(meal => {
          const items = entries.filter(entry => entry.meal === meal);
          const calories = items.reduce((sum, item) => sum + item.calories, 0);
          return <article className="meal-card" key={meal}>
            <div className="meal-title"><div className={`meal-icon ${meal.toLowerCase()}`}>{meal === "Breakfast" ? "☀" : meal === "Lunch" ? "◐" : meal === "Dinner" ? "☾" : "✦"}</div><div><h3>{meal}</h3><span>{Math.round(calories)} calories</span></div><button onClick={() => requestAddFood(meal, true)} aria-label={`Add food to ${meal}`}>+</button></div>
            {items.length === 0 ? <button className="empty-meal" onClick={() => requestAddFood(meal, true)}>Add your first food</button> : items.map(item => <div className="food-row" key={item.id}><div><strong>{item.name}</strong><span>{item.serving} · {round(item.carbs - item.fiber)}g net carbs</span></div><b>{round(item.calories)}</b><button onClick={() => setEditingEntry(item)} aria-label={`Edit ${item.name}`}>✎</button><button onClick={() => void removeEntry(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}
          </article>;
        })}
      </section>
      <button className="floating-add" onClick={() => requestAddFood(defaultMealForNow(), false)}><span>＋</span> Add food</button>
    </>}

    {addTarget && <AddFood meal={addTarget.meal} mealLocked={addTarget.locked} date={addTarget.date} profile={profile}
      foodsVersion={savedFoodsVersion} prefill={addTarget.prefill} copiedFrom={addTarget.copiedFrom}
      onClose={() => setAddTarget(null)}
      onSaved={(entry) => {
        // A copy saved onto today while a past day is on screen belongs to a
        // day this list is not showing, so it is announced rather than added
        // to the wrong day.
        if (entry.eatenOn === date) setEntries(current => [...current, entry]);
        else setCopyNote(current => ({ id: (current?.id ?? 0) + 1, text: `Added “${entry.name}” to ${longDate(entry.eatenOn)}.` }));
        setAddTarget(null);
      }} />}
    {settingsOpen && <SettingsEditor goals={goals} profile={profile} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setGoals(next); setSettingsOpen(false); }} />}
    {customWaterOpen && <CustomWater onClose={() => setCustomWaterOpen(false)} onAdd={(ounces) => { void addWater(ounces); setCustomWaterOpen(false); }} />}
    {exerciseOpen && <AddExercise date={date} profile={profile} onClose={() => setExerciseOpen(false)} onSaved={(entry) => { setExercise(current => [...current, entry]); setExerciseOpen(false); }} />}
    {editingExercise && <EditExercise entry={editingExercise} profile={profile} onClose={() => setEditingExercise(null)}
      onSaved={(entry) => {
        // Moved to another day: it leaves this day's list rather than sitting
        // in it showing someone else's date.
        setExercise(current => entry.exercisedOn === date
          ? current.map(item => item.id === entry.id ? entry : item)
          : current.filter(item => item.id !== entry.id));
        if (entry.exercisedOn !== date) setMessage(`“${entry.activity}” moved to ${longDate(entry.exercisedOn)}.`);
        setEditingExercise(null);
      }} />}
    {fatDetailOpen && <FatBreakdownDialog totals={fatDetail} goal={goals.fat} onClose={() => setFatDetailOpen(false)} />}
    {carbDetailOpen && <CarbBreakdownDialog totals={carbDetail} goals={netCarbGoals} standing={netCarbStanding} onClose={() => setCarbDetailOpen(false)} />}
    {editingEntry && <EditDiaryEntry entry={editingEntry} profile={profile}
      onClose={() => setEditingEntry(null)}
      onFoodsChanged={() => setSavedFoodsVersion(current => current + 1)}
      onCopyToToday={(values, meal) => {
        // The edit closes and the ordinary Add Food form opens on today,
        // prefilled. Nothing is written until that form is submitted, and the
        // entry being copied is not touched either way.
        setEditingEntry(null);
        setAddTarget({ meal, locked: false, date: localDate(), prefill: values, copiedFrom: editingEntry.eatenOn });
      }}
      onSaved={(entry) => {
        setEntries(current => entry.eatenOn === date
          ? current.map(item => item.id === entry.id ? entry : item)
          : current.filter(item => item.id !== entry.id));
        if (entry.eatenOn !== date) setMessage(`“${entry.name}” moved to ${longDate(entry.eatenOn)}.`);
        setEditingEntry(null);
      }} />}
    {pendingAdd && <PastDateWarning kind={pendingAdd.kind} date={pendingAdd.date}
      onConfirm={confirmPastAdd} onCancel={cancelPastAdd} />}
  </main>;
}

/**
 * The day's step count: one whole number per profile per day.
 *
 * Saving replaces whatever the day already held, so there is never a second
 * row for the same date. The value is validated here as well as on the server
 * so a decimal or a negative is refused before it leaves the phone.
 */
function StepsCard({ date, profile, entry, onSaved, onRemoved, onError }: {
  date: string; profile: Profile; entry: StepEntry | null;
  onSaved: (entry: StepEntry) => void; onRemoved: () => void; onError: (message: string) => void;
}) {
  const [value, setValue] = useState(entry ? String(entry.steps) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  const trimmed = value.trim();
  const dirty = trimmed !== (entry ? String(entry.steps) : "");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!/^\d+$/.test(trimmed)) { setError("Enter a whole number of steps, 0 or more."); return; }
    if (Number(trimmed) > 200000) { setError("That is more steps than a day allows. Check the number."); return; }
    setBusy(true);
    const response = await fetch("/api/steps", {
      method: "PUT", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ steppedOn: date, steps: Number(trimmed) }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error ?? "Unable to save those steps"); return; }
    onSaved(result.entry); setValue(String(result.entry.steps)); setNotice("Saved.");
  }

  async function remove() {
    setError(""); setNotice(""); setBusy(true);
    const response = await fetch(`/api/steps?date=${date}`, { method: "DELETE", headers });
    setBusy(false);
    if (!response.ok) { onError("Unable to remove those steps"); return; }
    onRemoved(); setValue(""); setNotice("Removed.");
  }

  return <section className="steps-card">
    <div className="steps-heading">
      <div className="steps-icon" aria-hidden="true">⇡</div>
      <div><p className="eyebrow">Steps</p><h2>{entry ? whole(entry.steps) : "—"} <small>{entry ? "steps today" : "not recorded"}</small></h2></div>
    </div>
    <form className="steps-form" onSubmit={save}>
      <label className="sr-label" htmlFor={`steps-${date}`}>Steps for this day</label>
      <input id={`steps-${date}`} inputMode="numeric" pattern="[0-9]*" type="number" min="0" max="200000" step="1"
        placeholder="e.g. 8500" value={value}
        onChange={event => { setValue(event.target.value); setError(""); setNotice(""); }} />
      <button type="submit" className="primary" disabled={busy || !dirty || trimmed === ""}>{busy ? "Saving…" : entry ? "Update" : "Save"}</button>
      {entry && <button type="button" className="steps-remove" onClick={() => void remove()} disabled={busy} aria-label="Remove the steps for this day">×</button>}
    </form>
    {error && <p className="form-error">{error}</p>}
    {notice && <p className="steps-notice" aria-live="polite">{notice}</p>}
  </section>;
}

function MyFoodsPage({ profile, onFoodsChanged }: { profile: Profile; onFoodsChanged: () => void }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [editing, setEditing] = useState<Food | null>(null);
  const [deleting, setDeleting] = useState<Food | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  useEffect(() => {
    fetch("/api/custom-foods", { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load saved foods");
      setFoods(data.foods ?? []);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load saved foods")).finally(() => setLoading(false));
  }, [headers]);

  /**
   * Drops one saved food. The row only leaves the screen once the server has
   * confirmed it, so a failed delete leaves the list exactly as it was.
   */
  async function remove(food: Food) {
    const response = await fetch(`/api/custom-foods?id=${food.id}`, { method: "DELETE", headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error ?? "Unable to delete that saved food");
    setFoods(current => current.filter(item => item.id !== food.id));
    setDeleting(null);
    setError("");
    setNotice(`"${food.name}" was deleted. Diary entries made from it are unchanged.`);
    onFoodsChanged();
  }
  return <section className="saved-food-page">
    <div className="section-heading"><div><p className="eyebrow">Reusable entries</p><h2>Saved foods</h2></div><span>{foods.length} {foods.length === 1 ? "food" : "foods"}</span></div>
    <p className="page-help">Changes here apply the next time you use a saved food. Previous diary entries remain unchanged.</p>
    {error && <p className="form-error">{error}</p>}
    {notice && <p className="saved-food-notice" aria-live="polite">{notice}</p>}
    {loading ? <div className="empty-state">Loading saved foods…</div> : foods.length === 0 ? <div className="empty-state">No saved foods yet.</div> : <div className="saved-food-list">{foods.map(food => <article className="saved-food-card" key={food.id}>
      <div><strong>{food.name}</strong><span>{food.serving}</span><small>{round(food.calories)} cal · {round(food.protein)}g protein · {round(food.carbs - food.fiber)}g net carbs</small></div>
      <div className="saved-food-actions">
        <button type="button" onClick={() => { setNotice(""); setEditing(food); }}>Edit</button>
        <button type="button" className="danger" onClick={() => { setNotice(""); setDeleting(food); }} aria-label={`Delete ${food.name}`}>Delete</button>
      </div>
    </article>)}</div>}
    {editing && <EditSavedFood food={editing} profile={profile} onClose={() => setEditing(null)} onSaved={(food) => { setFoods(current => current.map(item => item.id === food.id ? food : item)); setEditing(null); }} />}
    {deleting && <ConfirmDeleteFood food={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />}
  </section>;
}

/**
 * Names the food before it goes, because a saved food and a diary entry look
 * alike in a list and only one of them is being removed here.
 */
function ConfirmDeleteFood({ food, onClose, onConfirm }: { food: Food; onClose: () => void; onConfirm: (food: Food) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    try {
      await onConfirm(food);
    } catch (reason) {
      // The food stays on screen and the dialog stays open, so a failure can
      // be read and retried instead of looking like a silent success.
      setError(reason instanceof Error ? reason.message : "Unable to delete that saved food");
      setBusy(false);
    }
  }
  return <div className="modal-backdrop" onMouseDown={busy ? undefined : onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-food-title">
    <div className="modal-head"><div><p className="eyebrow">Saved foods</p><h2 id="delete-food-title">Delete this food?</h2></div><button onClick={onClose} disabled={busy} aria-label="Close">×</button></div>
    <p className="confirm-target"><strong>{food.name}</strong><span>{food.serving} · {round(food.calories)} cal</span></p>
    <p className="confirm-help">This removes it from My Foods only. Diary entries already made from it keep their own name, serving, and nutrition. {food.barcode ? "Its barcode becomes free to save against another food." : ""}</p>
    {error && <p className="form-error">{error}</p>}
    <div className="scanner-actions">
      <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="primary danger" onClick={() => void confirm()} disabled={busy}>{busy ? "Deleting…" : "Delete food"}</button>
    </div>
  </div></div>;
}

/**
 * Asked before anything is started on a day that has already passed.
 *
 * Built from the same confirmation pattern as `ConfirmDeleteFood`, so it is a
 * real dialog rather than a native `confirm()`: the day is named in the
 * question and on the button, Escape and the backdrop both cancel, and neither
 * answer writes anything. "No, go to today" is the cancel action, so closing
 * the dialog any other way simply abandons the add and leaves the diary where
 * it was rather than silently moving it.
 */
function PastDateWarning({ kind, date, onConfirm, onCancel }: {
  kind: AddKind; date: string; onConfirm: () => void; onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const warning = pastDateWarning(kind, date);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    }
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("keydown", keyDown); opener?.focus?.(); };
  }, [onCancel]);

  return <div className="modal-backdrop" onMouseDown={onCancel}>
    <div className="modal compact" ref={panel} tabIndex={-1} onMouseDown={event => event.stopPropagation()}
      role="dialog" aria-modal="true" aria-labelledby="past-date-title" aria-describedby="past-date-message">
      <div className="modal-head">
        <div><p className="eyebrow">Check the date</p><h2 id="past-date-title">{warning.title}</h2></div>
        <button onClick={onCancel} aria-label="Close">×</button>
      </div>
      <p className="confirm-target"><strong>{longDate(date)}</strong><span>Today is {longDate(localDate())}</span></p>
      <p className="confirm-help" id="past-date-message">{warning.message}</p>
      <div className="scanner-actions">
        <button type="button" className="secondary" onClick={onCancel}>{warning.cancelLabel}</button>
        <button type="button" className="primary" onClick={onConfirm} autoFocus>{warning.confirmLabel}</button>
      </div>
    </div>
  </div>;
}

function CalendarPage({ profile, onOpenDay }: { profile: Profile; onOpenDay: (date: string) => void }) {
  const [month, setMonth] = useState(monthKey(localDate()));
  const [data, setData] = useState<{ key: string; days: CalendarDay[]; currentGoal: number } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  const requestKey = `${profile}:${month}:${reloadKey}`;

  useEffect(() => {
    let active = true;
    fetch(`/api/calendar?month=${month}`, { headers })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to load the calendar"); return body; })
      .then(body => { if (!active) return; setError(""); setData({ key: requestKey, days: body.days ?? [], currentGoal: body.currentGoal ?? 0 }); })
      .catch(reason => { if (!active) return; setError(reason instanceof Error ? reason.message : "Unable to load the calendar"); setData({ key: requestKey, days: [], currentGoal: 0 }); });
    return () => { active = false; };
  }, [requestKey, month, headers]);

  const ready = data?.key === requestKey;
  const days = ready ? data.days : [];
  const loading = !ready;
  const today = localDate();
  const leading = days.length > 0 ? new Date(`${days[0].date}T12:00:00`).getDay() : 0;
  const logged = days.filter(day => day.items > 0);
  const moved = days.filter(day => day.hasMovement);

  function refresh() { setReloadKey(current => current + 1); }

  return <section className="calendar-page">
    <div className="section-heading"><div><p className="eyebrow">{profileNames[profile]} only</p><h2>Calendar</h2></div><span>{logged.length} logged · {moved.length} active</span></div>
    <p className="page-help">Each day is scored against the calorie goal that was saved for that day, so lowering your goal later never changes how past days look.</p>

    <div className="calendar-nav">
      <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
      <strong>{monthLabel(month)}</strong>
      <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
    </div>
    <button type="button" className="calendar-today" onClick={() => setMonth(monthKey(localDate()))}>Jump to this month</button>

    {error && <p className="form-error">{error}</p>}
    {loading ? <div className="empty-state">Loading the calendar…</div> : <>
      <div className="calendar-grid" role="grid" aria-label={`Calories for ${monthLabel(month)}`}>
        {weekdayInitials.map((initial, index) => <div key={index} className="calendar-weekday" aria-hidden="true">{initial}</div>)}
        {Array.from({ length: leading }, (_, index) => <div key={`blank-${index}`} className="calendar-blank" />)}
        {days.map(day => <button key={day.date} type="button"
          className={`calendar-day status-${day.status}${day.date === today ? " is-today" : ""}${day.hasData ? "" : " is-empty"}`}
          onClick={() => setSelected(day)}
          aria-label={`${longDate(day.date)}: ${day.items > 0 ? `${Math.round(day.calories)} calories against a ${day.goalCalories} goal, ${statusLabels[day.status]}` : "nothing logged"}, ${day.hasMovement ? `${round(day.exerciseMinutes)} minutes of movement` : "no movement"}, ${day.steps > 0 ? `${whole(day.steps)} steps` : "no steps"}`}>
          <span className="calendar-date">{Number(day.date.slice(8))}</span>
          {day.hasData && <>
            <span className="calendar-calories">{whole(day.calories)} Cal</span>
            <span className="calendar-metric">{whole(day.exerciseMinutes)} min</span>
            <span className="calendar-metric">{whole(day.steps)} steps</span>
          </>}
          <span className={`calendar-dot${day.hasMovement ? " moved" : ""}`} aria-hidden="true" />
        </button>)}
      </div>

      <div className="calendar-legend">
        <span className="key under">Under goal</span>
        <span className="key over">Over goal</span>
        <span className="key way-over">500+ over</span>
        <span className="key none">Nothing logged</span>
        <span className="key dot-moved">Movement tracked</span>
        <span className="key dot-still">No movement</span>
      </div>
    </>}

    {selected && <DayDetail day={selected} profile={profile} onClose={() => setSelected(null)}
      onOpenDay={date => { setSelected(null); onOpenDay(date); }}
      onSaved={() => { setSelected(null); refresh(); }} />}
  </section>;
}

/** Read-out for one day, including the saved goal and a way to correct it. */
function DayDetail({ day, profile, onClose, onOpenDay, onSaved }: { day: CalendarDay; profile: Profile; onClose: () => void; onOpenDay: (date: string) => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const calories = Number(new FormData(event.currentTarget).get("calories"));
    const response = await fetch("/api/calendar", {
      method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
      body: JSON.stringify({ date: day.date, calories }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to save that day's goal"); setBusy(false); return; }
    onSaved();
  }
  const over = day.calories - day.goalCalories;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="modal-head"><div><p className="eyebrow">{statusLabels[day.status]}</p><h2>{shortDate(day.date)}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <p className="day-detail-date">{longDate(day.date)}</p>
    <dl className="product-meta day-detail-meta">
      <div><dt>Calories eaten</dt><dd>{day.items > 0 ? amount(day.calories) : "Nothing logged"}</dd></div>
      <div><dt>Goal that day</dt><dd>{day.goalCalories}{day.goalSource === "current" ? " (current setting)" : ""}</dd></div>
      <div><dt>{over > 0 ? "Over by" : "Remaining"}</dt><dd className={day.status === "way-over" ? "flagged" : ""}>{day.items > 0 ? amount(Math.abs(over)) : "—"}</dd></div>
      <div><dt>Movement</dt><dd>{day.hasMovement ? `${round(day.exerciseMinutes)} min${day.exerciseCalories > 0 ? ` · ${Math.round(day.exerciseCalories)} cal` : ""}` : "None tracked"}</dd></div>
    </dl>
    {day.activities && <p className="day-detail-activities">{day.activities}</p>}
    {day.goalSource === "current" && <p className="day-detail-note">No goal was saved for this day, so your current setting is shown. Saving below pins a goal to this day.</p>}

    {editing
      ? <form className="food-form" onSubmit={submit}>
          <label>Calorie goal for this day<input name="calories" type="number" min="1" max="20000" step="1" required defaultValue={day.goalCalories} autoFocus /></label>
          {error && <p className="form-error">{error}</p>}
          <div className="scanner-actions">
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save goal"}</button>
          </div>
        </form>
      : <div className="scanner-actions">
          <button type="button" className="secondary" onClick={() => setEditing(true)}>Correct goal</button>
          <button type="button" className="primary" onClick={() => onOpenDay(day.date)}>Open in diary</button>
        </div>}
  </div></div>;
}

function ReportsPage({ profile }: { profile: Profile }) {
  // Presets and this default end on the last completed day; see lastCompleteDays.
  const initial = lastCompleteDays(7);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [report, setReport] = useState<{ key: string; days: ReportDay[]; totals: ReportTotals | null; averages: ReportAverages | null; nutrition: ReportNutrition | null; goals: ReportGoals | null } | null>(null);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  const rangeInvalid = start > end;
  const rangeKey = `${profile}:${start}:${end}`;

  useEffect(() => {
    if (rangeInvalid) return;
    let active = true;
    fetch(`/api/reports?start=${start}&end=${end}`, { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to build the report"); return data; })
      .then(data => { if (!active) return; setError(""); setReport({ key: rangeKey, days: data.days ?? [], totals: data.totals ?? null, averages: data.averages ?? null, nutrition: data.nutrition ?? null, goals: data.goals ?? null }); })
      .catch(reason => { if (!active) return; setError(reason instanceof Error ? reason.message : "Unable to build the report"); setReport({ key: rangeKey, days: [], totals: null, averages: null, nutrition: null, goals: null }); });
    return () => { active = false; };
  }, [rangeKey, rangeInvalid, start, end, headers]);

  // The report belongs to the range currently on screen only when the keys match.
  const ready = report?.key === rangeKey;
  const days = ready ? report.days : [];
  const totals = ready ? report.totals : null;
  const averages = ready ? report.averages : null;
  const nutrition = ready ? report.nutrition : null;
  const reportGoals = ready ? report.goals : null;
  const loading = !rangeInvalid && !ready;

  // Read the clock again rather than reusing the render-time value, so a page
  // left open overnight still reports against the day that just ended.
  function applyLastDays(count: number) { const range = lastCompleteDays(count); setStart(range.start); setEnd(range.end); }
  const maxCalories = days.reduce((high, day) => Math.max(high, day.calories), 0);
  const maxMinutes = days.reduce((high, day) => Math.max(high, day.exerciseMinutes), 0);

  return <section className="report-page">
    <div className="section-heading"><div><p className="eyebrow">{profileNames[profile]} only</p><h2>Calories & movement</h2></div><span>{days.length} {days.length === 1 ? "day" : "days"}</span></div>
    <p className="page-help">Every date in the range is listed. Days without entries show zero, and a day with no step entry shows a dash rather than a zero.</p>

    <ExportPanel profile={profile} eyebrow="Export centre" title="Export everything"
      help="A complete export of this profile. Pick a date range, keep or clear any section, then take it as a printable PDF or as JSON for an analysis tool. Download Summary PDF gives the same range as a one-page overview for a doctor, averaged over recorded days only."
      sections={[...allExportSections]} summary />

    <div className="report-range">
      <label>Start<input type="date" value={start} max={end} onChange={event => setStart(event.target.value)} /></label>
      <label>End<input type="date" value={end} min={start} onChange={event => setEnd(event.target.value)} /></label>
      <div className="report-presets">
        <button type="button" onClick={() => applyLastDays(7)}>Last 7 days</button>
        <button type="button" onClick={() => applyLastDays(14)}>Last 14 days</button>
        <button type="button" onClick={() => applyLastDays(30)}>Last 30 days</button>
      </div>
    </div>

    {(rangeInvalid || error) && <p className="form-error">{rangeInvalid ? "The start date must come before the end date." : error}</p>}
    {rangeInvalid ? <div className="empty-state">Choose a valid date range.</div> : loading ? <div className="empty-state">Building your report…</div> : days.length === 0 ? <div className="empty-state">No dates in this range.</div> : <>
      <div className="report-stats">
        <div className="report-stat"><span>Total calories</span><strong>{amount(totals?.calories ?? 0)}</strong><small>{totals?.daysWithFood ?? 0} of {days.length} days logged</small></div>
        <div className="report-stat"><span>Average per day</span><strong>{amount(averages?.caloriesPerDay ?? 0)}</strong><small>{amount(averages?.caloriesPerLoggedDay ?? 0)} per logged day</small></div>
        <div className="report-stat"><span>Movement</span><strong>{amount(totals?.exerciseMinutes ?? 0)} <i>min</i></strong><small>{amount(averages?.exerciseMinutesPerDay ?? 0)} min per day</small></div>
        <div className="report-stat"><span>Calories burned</span><strong>{amount(totals?.exerciseCalories ?? 0)}</strong><small>{totals?.sessions ?? 0} recorded {(totals?.sessions ?? 0) === 1 ? "session" : "sessions"}</small></div>
        <div className="report-stat"><span>Steps</span><strong>{whole(totals?.steps ?? 0)}</strong><small>{whole(averages?.stepsPerRecordedDay ?? 0)} per recorded day · {totals?.daysWithSteps ?? 0} of {days.length} days</small></div>
      </div>

      <div className="report-chart">
        <div className="report-legend"><span className="key calories">Calories eaten</span><span className="key movement">Movement minutes</span></div>
        <div className="report-chart-scroll">
          <div className="report-chart-grid">
            {days.map(day => <div className="report-column" key={day.date}>
              <div className="report-bars" aria-hidden="true">
                <i className="calories" style={{ height: `${maxCalories > 0 ? day.calories / maxCalories * 100 : 0}%` }} />
                <i className="movement" style={{ height: `${maxMinutes > 0 ? day.exerciseMinutes / maxMinutes * 100 : 0}%` }} />
              </div>
              <small className="report-column-day">{weekdayLabel(day.date)}</small>
              <small className="report-column-date">{shortDate(day.date)}</small>
              <span className="report-visually-hidden">{shortDate(day.date)}: {amount(day.calories)} calories, {amount(day.exerciseMinutes)} minutes of movement</span>
            </div>)}
          </div>
        </div>
      </div>

      <div className="report-table-wrap">
        <table className="report-table">
          <caption className="report-visually-hidden">Daily calories and movement for {profileNames[profile]}</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Calories</th><th scope="col">Minutes</th><th scope="col">Burned</th><th scope="col">Steps</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date} className={day.items === 0 && day.sessions === 0 && day.steps === null ? "report-empty-day" : ""}>
            <th scope="row"><strong>{weekdayLabel(day.date)} {shortDate(day.date)}</strong>{day.activities && <small>{day.activities}</small>}</th>
            <td>{amount(day.calories)}</td><td>{amount(day.exerciseMinutes)}</td><td>{amount(day.exerciseCalories)}</td>
            <td>{day.steps === null ? "—" : whole(day.steps)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td>{amount(totals?.calories ?? 0)}</td><td>{amount(totals?.exerciseMinutes ?? 0)}</td><td>{amount(totals?.exerciseCalories ?? 0)}</td><td>{whole(totals?.steps ?? 0)}</td></tr>
            <tr><th scope="row">Daily average</th><td>{amount(averages?.caloriesPerDay ?? 0)}</td><td>{amount(averages?.exerciseMinutesPerDay ?? 0)}</td><td>{amount(Math.round((totals?.exerciseCalories ?? 0) / days.length * 100) / 100)}</td><td>{whole(averages?.stepsPerRecordedDay ?? 0)}</td></tr></tfoot>
        </table>
      </div>

      <NutritionAveragesTable nutrition={nutrition} fat={totals?.fatDetail ?? emptyFatTotals()} goals={reportGoals} />

      <SevenDayNutritionTrend key={profile} profile={profile} />

      {days.some(day => (day.movement ?? []).length > 0) && <div className="report-movement">
        <h3>Movement log</h3>
        <p className="page-help">Each recorded activity in this range, with the comments saved against it.</p>
        {days.filter(day => (day.movement ?? []).length > 0).map(day => <div className="report-movement-day" key={day.date}>
          <p className="report-movement-date">{weekdayLabel(day.date)} {shortDate(day.date)}</p>
          {(day.movement ?? []).map((item, index) => <div className="report-movement-row" key={index}>
            <strong>{item.activity}</strong>
            <span>{amount(item.minutes)} min{item.calories > 0 ? ` · ${amount(item.calories)} cal` : ""}</span>
            {item.comments.trim() && <p>{item.comments}</p>}
          </div>)}
        </div>)}
      </div>}
    </>}
  </section>;
}

/**
 * The rolling seven-day nutrition trend.
 *
 * It keeps its own range rather than following the pickers above, because it
 * is defined as the last seven completed days: it ends on yesterday and never
 * includes today, the rule every automatic range in this application follows
 * (see `lastCompleteDays`). A part-finished day would pull every figure down
 * and make the trend read as a fall that never happened.
 *
 * Days with nothing logged still appear, showing zeros, exactly as the range
 * table above does. Rows run oldest to newest, as everywhere else here.
 *
 * The grand total sums each column down its own units. Calories and grams are
 * never added together into one number, and there is deliberately no total of
 * the totals.
 */
function SevenDayNutritionTrend({ profile }: { profile: Profile }) {
  // Read once per mount, so a page left open overnight still reports against
  // the day that has just ended rather than a stale one.
  const [range] = useState(() => lastCompleteDays(7));
  const [days, setDays] = useState<ReportDay[] | null>(null);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  // Keyed on the profile by its caller, so switching profile remounts this
  // with empty state rather than needing a synchronous reset in the effect.
  useEffect(() => {
    let active = true;
    fetch(`/api/reports?start=${range.start}&end=${range.end}`, { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to build the seven-day trend"); return data; })
      .then(data => { if (active) setDays(data.days ?? []); })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "Unable to build the seven-day trend"); setDays([]); } });
    return () => { active = false; };
  }, [range.start, range.end, headers]);

  const totals = useMemo(() => (days ?? []).reduce((sum, day) => ({
    calories: sum.calories + day.calories, fat: sum.fat + day.fat,
    carbs: sum.carbs + day.carbs, fiber: sum.fiber + day.fiber,
  }), { calories: 0, fat: 0, carbs: 0, fiber: 0 }), [days]);
  const logged = (days ?? []).filter(day => day.items > 0).length;

  return <div className="report-nutrition report-trend">
    <h3>Seven-day nutrition trend</h3>
    <p className="page-help">
      The seven completed days from {mediumDate(range.start)} to {mediumDate(range.end)}. Today is still in
      progress, so it is deliberately left out. Carbohydrates here are total carbohydrates, not net carbs.
    </p>
    {error && <p className="form-error">{error}</p>}
    {days === null
      ? <div className="empty-state">Loading the seven-day trend…</div>
      : days.length === 0
        ? <div className="empty-state">No completed days to show yet.</div>
        : <>
            <div className="report-table-wrap">
              <table className="report-table">
                <caption className="report-visually-hidden">
                  Calories, total fat, total carbohydrates, and fiber for each of the seven completed days
                </caption>
                <thead><tr>
                  <th scope="col">Day</th>
                  <th scope="col">Calories</th>
                  <th scope="col">Total fat (g)</th>
                  <th scope="col">Total carbs (g)</th>
                  <th scope="col">Fiber (g)</th>
                </tr></thead>
                <tbody>{days.map(day => <tr key={day.date} className={day.items === 0 ? "report-empty-day" : ""}>
                  <th scope="row"><strong>{weekdayLabel(day.date)} {shortDate(day.date)}</strong></th>
                  <td>{amount(day.calories)}</td>
                  <td>{amount(day.fat)}</td>
                  <td>{amount(day.carbs)}</td>
                  <td>{amount(day.fiber)}</td>
                </tr>)}</tbody>
                <tfoot><tr>
                  <th scope="row">Grand total</th>
                  <td>{amount(Math.round(totals.calories * 100) / 100)} <i>cal</i></td>
                  <td>{amount(Math.round(totals.fat * 100) / 100)} <i>g</i></td>
                  <td>{amount(Math.round(totals.carbs * 100) / 100)} <i>g</i></td>
                  <td>{amount(Math.round(totals.fiber * 100) / 100)} <i>g</i></td>
                </tr></tfoot>
              </table>
            </div>
            <p className="page-help">
              {logged} of {days.length} days have food logged. Each column is totalled in its own unit — calories
              and grams are never added together.
            </p>
          </>}
  </div>;
}

/**
 * Nutrition averages for a report range, with the fat breakdown beneath total
 * fat and a percentage or a piece of context beside every metric.
 *
 * Every number here comes from `nutritionRows`, the same builder both PDFs
 * use, so the screen and the printed documents cannot disagree. Averages cover
 * the days holding at least one food entry, which is the rule the rest of the
 * report already follows.
 *
 * Two different percentages appear in the last column and are always labelled
 * for which they are: a share of the average calories, or how much of a
 * configured goal was reached. Fiber only ever shows the second kind.
 */
function NutritionAveragesTable({ nutrition, fat, goals }: {
  nutrition: ReportNutrition | null; fat: FatTotals; goals: ReportGoals | null;
}) {
  const recordedDays = nutrition?.recordedDays ?? 0;
  const rows: NutritionRow[] = nutrition
    ? nutritionRows({
        averages: nutrition.averages, fat, recordedDays, goals,
        subtypeDays: nutrition.subtypeDays as Partial<Record<typeof fatSubtypeKeys[number], number>>,
      })
    : [];
  const coverage = fatCoverageNote(fat);

  return <div className="report-nutrition">
    <h3>Nutrition averages</h3>
    <p className="page-help">
      {recordedDays === 0
        ? "No food was recorded in this range, so there is nothing to average."
        : `Averages cover the ${recordedDays} ${recordedDays === 1 ? "day" : "days"} holding at least one food entry, not every day in the range. Total carbohydrates have no goal; net carbs are shown separately as a calorie-equivalent because they exclude fiber.`}
    </p>
    {recordedDays > 0 && <>
      <div className="report-table-wrap">
        <table className="report-table nutrition-table">
          <caption className="report-visually-hidden">Average nutrition per recorded day, with calorie shares and goal percentages</caption>
          <thead><tr>
            <th scope="col">Metric</th>
            <th scope="col">Average per recorded day</th>
            <th scope="col">Current daily goal</th>
            <th scope="col">Percentage or context</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.key} className={row.nested ? "nutrition-subrow" : ""}>
            <th scope="row"><strong>{row.nested ? `— ${row.metric}` : row.metric}</strong></th>
            <td>{row.average}</td>
            <td>{row.goal}</td>
            <td className="nutrition-context">{row.context || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="page-help report-fat-note">{CURRENT_GOALS_NOTE}</p>
      <p className="page-help">{CALORIE_SHARE_NOTE}</p>
      {coverage && <p className="page-help">{coverage}</p>}
    </>}
  </div>;
}

/**
 * Weight log: one reading per day, newest first, with the change from the
 * previous reading so a run of entries reads as a trend.
 */
function WeightPage({ profile }: { profile: Profile }) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [formKey, setFormKey] = useState(0);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/weight", { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to load your weight log"); return data; })
      .then(data => { if (!active) return; setError(""); setEntries(data.entries ?? []); })
      .catch(reason => { if (!active) return; setError(reason instanceof Error ? reason.message : "Unable to load your weight log"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [headers]);

  /** Newest first, so the reading before a row is the next one in the list. */
  const sorted = useMemo(() => [...entries].sort((a, b) => b.weighedOn.localeCompare(a.weighedOn)), [entries]);
  /** Oldest reading on record, which lets the export offer an "All recorded" range. */
  const oldest = sorted.length > 0 ? sorted[sorted.length - 1].weighedOn : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/weight", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ weighedOn: form.get("weighedOn"), pounds: Number(form.get("pounds")), note: form.get("note") ?? "" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setFormError(result.error ?? "Unable to save that weight"); setBusy(false); return; }
    setEntries(current => [...current, result.entry]);
    setFormKey(current => current + 1);
    setBusy(false);
  }

  async function remove(entry: WeightEntry) {
    const response = await fetch(`/api/weight?id=${entry.id}`, { method: "DELETE", headers });
    if (response.ok) setEntries(current => current.filter(item => item.id !== entry.id));
    else setError("Unable to remove that weight entry");
  }

  return <section className="weight-page">
    <div className="section-heading"><div><p className="eyebrow">{profileNames[profile]} only</p><h2>Weight log</h2></div><span>{sorted.length} {sorted.length === 1 ? "entry" : "entries"}</span></div>
    <p className="page-help">Log your weight as often as you like — weekly is plenty. One reading is kept per day, and any entry can be corrected or removed.</p>

    {!loading && <WeightChart entries={sorted} />}

    <ExportPanel profile={profile} eyebrow="Export centre" title="Export weight history"
      help="Take this weight log as a printable PDF or as JSON. Only your own readings are included."
      sections={["weights"]} earliest={oldest} />

    <form key={formKey} className="food-form weight-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Date<input name="weighedOn" type="date" required defaultValue={localDate()} max={localDate()} /></label>
        <label>Weight (lbs)<input name="pounds" type="number" min="0.01" max="1500" step="0.01" required placeholder="e.g. 214.50" /></label>
      </div>
      <label>Note (optional)<input name="note" maxLength={240} placeholder="e.g. morning, after the gym" /></label>
      {formError && <p className="form-error">{formError}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Log this weight"}</button>
    </form>

    {error && <p className="form-error">{error}</p>}
    {loading ? <div className="empty-state">Loading your weight log…</div>
      : sorted.length === 0 ? <div className="empty-state">No weights logged yet. Add your first one above.</div>
      : <div className="weight-list">{sorted.map((entry, index) => {
          const previous = sorted[index + 1];
          const change = previous ? Math.round((entry.pounds - previous.pounds) * 100) / 100 : null;
          return <article className="weight-row" key={entry.id}>
            <div className="weight-main">
              <strong>{amount(entry.pounds)} <i>lbs</i></strong>
              <span>{longDate(entry.weighedOn)}</span>
              {entry.note && <small className="weight-note">{entry.note}</small>}
            </div>
            <span className={`weight-change${change === null ? " first" : change > 0 ? " up" : change < 0 ? " down" : ""}`}>
              {change === null ? "First entry" : change === 0 ? "No change" : `${change > 0 ? "+" : "−"}${amount(Math.abs(change))} lbs`}
              {change !== null && <small>since {shortDate(previous.weighedOn)}</small>}
            </span>
            <div className="weight-actions">
              <button type="button" onClick={() => setEditing(entry)} aria-label={`Edit the weight for ${longDate(entry.weighedOn)}`}>✎</button>
              <button type="button" onClick={() => void remove(entry)} aria-label={`Remove the weight for ${longDate(entry.weighedOn)}`}>×</button>
            </div>
          </article>;
        })}</div>}

    {editing && <EditWeight entry={editing} profile={profile} onClose={() => setEditing(null)}
      onSaved={entry => { setEntries(current => current.map(item => item.id === entry.id ? entry : item)); setEditing(null); }} />}
  </section>;
}

function EditWeight({ entry, profile, onClose, onSaved }: { entry: WeightEntry; profile: Profile; onClose: () => void; onSaved: (entry: WeightEntry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/weight", {
      method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
      body: JSON.stringify({ id: entry.id, weighedOn: form.get("weighedOn"), pounds: Number(form.get("pounds")), note: form.get("note") ?? "" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Unable to update that weight"); setBusy(false); return; }
    onSaved(result.entry);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="modal-head"><div><p className="eyebrow">Weight log</p><h2>Edit weight</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <form className="food-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Date<input name="weighedOn" type="date" required defaultValue={entry.weighedOn} /></label>
        <label>Weight (lbs)<input name="pounds" type="number" min="0.01" max="1500" step="0.01" required defaultValue={amount(entry.pounds)} autoFocus /></label>
      </div>
      <label>Note (optional)<input name="note" maxLength={240} defaultValue={entry.note} /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
    </form>
  </div></div>;
}

/**
 * One journal entry per day, written by hand.
 *
 * The day being written is chosen with the same date strip as the diary, and
 * that day's entry is loaded on its own so a day older than the recent list
 * still opens correctly.
 */
function JournalPage({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState<JournalEntry | null>(null);
  const [loadingDay, setLoadingDay] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listKey, setListKey] = useState(0);
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);

  useEffect(() => {
    let active = true;
    setLoadingDay(true); setNotice("");
    fetch(`/api/journal?date=${date}`, { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to load that day"); return data; })
      .then(data => { if (!active) return; setError(""); setSaved(data.entry ?? null); setBody(data.entry?.body ?? ""); })
      .catch(reason => { if (!active) return; setError(reason instanceof Error ? reason.message : "Unable to load that day"); })
      .finally(() => { if (active) setLoadingDay(false); });
    return () => { active = false; };
  }, [date, headers]);

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    fetch("/api/journal", { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to load your journal"); return data; })
      .then(data => { if (!active) return; setEntries(data.entries ?? []); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingList(false); });
    return () => { active = false; };
  }, [headers, listKey]);

  const dirty = body.trim() !== (saved?.body ?? "");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const response = await fetch("/api/journal", {
      method: "PUT", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ entryOn: date, body }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Unable to save that entry"); setBusy(false); return; }
    setSaved(result.entry); setBody(result.entry.body); setNotice("Saved.");
    setListKey(current => current + 1); setBusy(false);
  }

  async function remove() {
    if (!saved) return;
    const response = await fetch(`/api/journal?id=${saved.id}`, { method: "DELETE", headers });
    if (!response.ok) { setError("Unable to remove that entry"); return; }
    setSaved(null); setBody(""); setNotice("Entry removed."); setListKey(current => current + 1);
  }

  const others = entries.filter(entry => entry.entryOn !== date);

  return <section className="journal-page">
    <div className="section-heading"><div><p className="eyebrow">{profileNames[profile]} only</p><h2>Daily journal</h2></div><span>{entries.length} {entries.length === 1 ? "day" : "days"}</span></div>
    <p className="page-help">One entry per day for how the day went. Write it yourself for now — the assisted recap will fill this in later.</p>

    <ExportPanel profile={profile} eyebrow="Export centre" title="Export journal entries"
      help="Take your written entries as a printable PDF or as JSON. Only your own journal is included."
      sections={["journalEntries"]} earliest={entries.length > 0 ? entries[entries.length - 1].entryOn : null} />

    <section className="date-nav" aria-label="Choose journal date">
      <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
      <button type="button" className="date-button" onClick={() => setDate(localDate())}>
        <strong>{date === localDate() ? "Today" : weekdayLabel(date)}</strong>
        <span>{longDate(date)}</span>
      </button>
      <button type="button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
    </section>

    {error && <p className="form-error">{error}</p>}
    {loadingDay ? <div className="empty-state">Loading that day…</div> : <form className="food-form journal-form" onSubmit={save}>
      <label className="journal-field">How did the day go?
        <textarea className="meal-textarea" value={body} maxLength={8000} placeholder="Meals, movement, energy, sleep, how you felt about the day…"
          onChange={event => { setBody(event.target.value); setNotice(""); }} />
      </label>
      <div className="journal-meta">
        <small>{body.length} of 8000 characters</small>
        {saved && <small>Last saved {new Date(saved.updatedAt).toLocaleString()}</small>}
      </div>
      {notice && <p className="journal-notice">{notice}</p>}
      <div className="scanner-actions">
        {saved
          ? <button type="button" className="secondary" onClick={() => void remove()}>Delete entry</button>
          : <button type="button" className="secondary" onClick={() => { setBody(""); setNotice(""); }} disabled={body === ""}>Clear</button>}
        <button type="submit" className="primary" disabled={busy || !body.trim() || !dirty}>{busy ? "Saving…" : saved ? "Update entry" : "Save entry"}</button>
      </div>
    </form>}

    <div className="section-heading journal-recent"><div><p className="eyebrow">Earlier days</p><h2>Recent entries</h2></div></div>
    {loadingList ? <div className="empty-state">Loading earlier entries…</div>
      : others.length === 0 ? <div className="empty-state">Nothing written on other days yet.</div>
      : <div className="journal-list">{others.map(entry => <button type="button" className="journal-card" key={entry.id} onClick={() => setDate(entry.entryOn)}>
          <strong>{weekdayLabel(entry.entryOn)} {shortDate(entry.entryOn)}</strong>
          <span>{entry.body.length > 160 ? `${entry.body.slice(0, 160)}…` : entry.body}</span>
        </button>)}</div>}
  </section>;
}

/**
 * The four optional fat subtypes, tucked behind one toggle so the form is no
 * longer than it was for anyone who does not track them.
 *
 * The fields stay in the DOM when collapsed, only hidden, so submitting a
 * collapsed section keeps whatever values were already there instead of
 * silently clearing them. A blank field means "not available" and is stored as
 * such; it is never turned into a zero, and a real 0 can always be typed.
 */
function FatFields({ values }: { values: Partial<FatBreakdown> }) {
  const filled = fatSubtypeKeys.filter(key => values[key] !== null && values[key] !== undefined).length;
  const [open, setOpen] = useState(filled > 0);
  return <div className="fat-fields">
    <button type="button" className="fat-fields-toggle" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>Fat breakdown <small>{filled > 0 ? `${filled} of 4 filled in` : "optional"}</small></span>
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    <div hidden={!open}>
      <div className="form-grid">
        {fatSubtypeKeys.map(key => <label key={key}>{fatSubtypeLabels[key]} (g)
          <input name={key} type="number" min="0" step="0.01" inputMode="decimal" defaultValue={fieldValue(values[key])} />
        </label>)}
      </div>
      <small className="field-help">Leave a box empty when the label does not give it — empty is kept as “not available”, never as zero. Enter 0 only when the food really has none. The four do not have to add up to total fat.</small>
    </div>
  </div>;
}

function NutritionFields({ item }: { item: Food | Entry }) {
  return <>
    <div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="0.01" required defaultValue={item.calories} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.01" required defaultValue={item.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.01" required defaultValue={item.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.01" required defaultValue={item.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.01" required defaultValue={item.fiber} /></label></div>
    <FatFields values={item} />
  </>;
}

function EditSavedFood({ food, profile, onClose, onSaved }: { food: Food; profile: Profile; onClose: () => void; onSaved: (food: Food) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/custom-foods", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify({ ...body, id: food.id }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to update saved food"); setBusy(false); return; }
    onSaved(result.food);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">My Foods</p><h2>Edit saved food</h2></div><button onClick={onClose}>×</button></div><div className="coming-soon"><span>✓</span><div><strong>Past entries are protected</strong><p>This changes the reusable saved food only.</p></div></div><form className="food-form" onSubmit={submit}><label>Food name<input name="name" required defaultValue={food.name} /></label><label>Serving<input name="serving" required defaultValue={food.serving} /></label><NutritionFields item={food} />{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></div></div>;
}

/**
 * Reads the food currently typed into an edit form.
 *
 * Used by every action on the Edit Food screen, so Save, Copy to Today, and
 * Add to My Foods all work from exactly the same values — including edits that
 * have not been saved yet. A blank fat subtype stays null, never zero.
 */
function readFoodForm(form: HTMLFormElement): { meal: Meal; eatenOn: string; values: FoodValues } {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const number = (key: string) => Number(data.get(key));
  const optional = (key: string) => {
    const raw = text(key);
    return raw === "" ? null : Number(raw);
  };
  return {
    meal: text("meal") as Meal,
    eatenOn: text("eatenOn"),
    values: {
      name: text("name"), serving: text("serving"),
      calories: number("calories"), protein: number("protein"), fat: number("fat"),
      carbs: number("carbs"), fiber: number("fiber"),
      saturatedFat: optional("saturatedFat"), transFat: optional("transFat"),
      monounsaturatedFat: optional("monounsaturatedFat"), polyunsaturatedFat: optional("polyunsaturatedFat"),
    },
  };
}

/**
 * One saved diary entry, with the three things that can be done to it.
 *
 * They are deliberately separate operations:
 *  - Save changes updates this one entry, and moves it when the diary date is
 *    changed. It is a move, never a copy: the same row is updated, so there is
 *    only ever one of it.
 *  - Copy to Today opens the ordinary Add Food form on today, prefilled with
 *    whatever is on screen now. Nothing is written until that form is
 *    submitted, and this entry is not touched either way.
 *  - Add to My Foods saves a reusable food from these values. It does not
 *    move, copy, or alter the diary entry, and Copy to Today does not add
 *    anything to My Foods.
 */
function EditDiaryEntry({ entry, profile, onClose, onSaved, onCopyToToday, onFoodsChanged }: {
  entry: Entry; profile: Profile; onClose: () => void; onSaved: (entry: Entry) => void;
  onCopyToToday: (values: FoodValues, meal: Meal) => void; onFoodsChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [savingFood, setSavingFood] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  // A second tap must not write a second time, whatever the button's disabled
  // state has managed to render yet.
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/entries", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify({ ...body, id: entry.id }) });
    const result = await response.json();
    inFlight.current = false;
    if (!response.ok) { setError(result.error ?? "Unable to update diary entry"); setBusy(false); return; }
    onSaved(result.entry);
  }

  /** Hands the values on screen to the Add Food form. Nothing is saved here. */
  function copyToToday() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const { meal, values } = readFoodForm(form);
    // Routed through the shared copier, so the identity, the day it was eaten,
    // and the audit columns are dropped in exactly one place.
    onCopyToToday(copyOfEntry({ ...entry, ...values, meal }), meal);
  }

  /** Saves these values as a reusable food. The diary entry is left alone. */
  async function addToMyFoods() {
    const form = formRef.current;
    if (!form || savingFood) return;
    if (!form.reportValidity()) return;
    setSavingFood(true); setError(""); setNotice("");
    const { values } = readFoodForm(form);
    try {
      const response = await fetch("/api/custom-foods", {
        method: "POST", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
        body: JSON.stringify(savedFoodFrom(values)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.error ?? "Unable to save that food to My Foods"); return; }
      setNotice(result.created
        ? `“${values.name}” was added to My Foods. This diary entry is unchanged.`
        : `“${values.name}” was already in My Foods, so it was updated. This diary entry is unchanged.`);
      onFoodsChanged();
    } catch {
      setError("Unable to reach My Foods. Nothing was saved and this diary entry is unchanged.");
    } finally {
      setSavingFood(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-entry-title">
    <div className="modal-head"><div><p className="eyebrow">Diary entry</p><h2 id="edit-entry-title">Edit food</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <form className="food-form" ref={formRef} onSubmit={submit}>
      <div className="form-grid">
        <label>Diary date<input name="eatenOn" type="date" required defaultValue={entry.eatenOn} /><small>Changing this moves the entry to that day.</small></label>
        <label>Meal<select name="meal" defaultValue={entry.meal}>{meals.map(meal => <option key={meal}>{meal}</option>)}</select></label>
      </div>
      <label>Food name<input name="name" required defaultValue={entry.name} /></label>
      <label>Serving eaten<input name="serving" required defaultValue={entry.serving} /></label>
      <NutritionFields item={entry} />
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="saved-food-notice" aria-live="polite">{notice}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      <div className="entry-actions">
        <button type="button" className="secondary" onClick={copyToToday} disabled={busy}>Copy to Today</button>
        <button type="button" className="secondary" onClick={() => void addToMyFoods()} disabled={busy || savingFood}>{savingFood ? "Saving…" : "Add to My Foods"}</button>
      </div>
      <small className="field-help">Copy to Today opens a new entry for today with these values, leaving this one exactly as it is. Add to My Foods saves a reusable food and changes nothing in your diary.</small>
    </form>
  </div></div>;
}

function ProfileChooser({ onSelect }: { onSelect: (profile: Profile) => void }) {
  return <main className="profile-screen"><div className="profile-panel"><div className="brand-mark large">N</div><p className="eyebrow">Daily Food Tracker</p><h1>Who is tracking?</h1><p>Your food, goals, water, exercise, and custom foods stay in your own profile.</p><div className="profile-options"><button onClick={() => onSelect("chris")}><span>C</span><strong>Chris</strong></button><button onClick={() => onSelect("sarah")}><span>S</span><strong>Sarah</strong></button></div></div></main>;
}

/**
 * One macro card. Given `onOpen` it becomes a real button, so it opens with a
 * click, with Enter, or with Space, and keeps the same appearance either way.
 */
function Macro({ label, value, goal, color, onOpen, openLabel }: { label: string; value: number; goal: number; color: string; onOpen?: () => void; openLabel?: string }) {
  const body = <>
    <div className="macro-label"><span>{label}</span><b>{value}g</b></div>
    <div className="progress"><i className={color} style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div>
    <small>{Math.max(0, round(goal - value))}g left</small>
  </>;
  if (!onOpen) return <div className="macro">{body}</div>;
  return <button type="button" className="macro macro-button" onClick={onOpen}
    aria-haspopup="dialog" aria-label={`${label} ${value} grams of ${goal}. ${openLabel ?? "Show more"}.`}>
    {body}
    <span className="macro-more" aria-hidden="true">Breakdown</span>
  </button>;
}

/**
 * The day's carbohydrates, split into the two figures that matter.
 *
 * Total carbs and net carbs are both readable without opening anything, in two
 * equal halves. Net carbs carry the progress bar because that is the half with
 * a configured goal; total carbohydrate deliberately has none, exactly as in
 * the reports and both PDFs.
 *
 * The whole card is one button, so it opens with a tap, with Enter, or with
 * Space, and reads as a single control to a screen reader rather than as two
 * unrelated numbers.
 */
function CarbCard({ totals, goals, standing, onOpen }: {
  totals: CarbTotals; goals: NetCarbGoals; standing: ReturnType<typeof netCarbProgress>; onOpen: () => void;
}) {
  return <section className="carb-card">
    <button type="button" className="carb-card-button" onClick={onOpen} aria-haspopup="dialog"
      aria-label={`Carbohydrates. Total ${amount(totals.carbs)} grams, net ${amount(totals.netCarbs)} grams against a goal of ${netCarbGoalLabel(goals)}. ${standing.summary}. Show the carbohydrate breakdown.`}>
      <div className="carb-half">
        <span>TOTAL CARBS</span>
        <strong>{amount(totals.carbs)}<i>g</i></strong>
        <small>{amount(totals.fiber)}g fiber included</small>
      </div>
      <div className="carb-half net">
        <span>NET CARBS</span>
        <strong>{amount(totals.netCarbs)}<i>g</i></strong>
        <div className="progress"><i className="purple" style={{ width: `${Math.min(100, goals.max > 0 ? totals.netCarbs / goals.max * 100 : 0)}%` }} /></div>
        <small className={`carb-standing ${standing.state}`}>{standing.summary}</small>
      </div>
      <span className="macro-more" aria-hidden="true">Breakdown</span>
    </button>
  </section>;
}

/**
 * Today's carbohydrates in full, opened from the card above.
 *
 * Net carbs are shown as the tracker actually works them out — total
 * carbohydrate minus fiber — rather than as a number with no explanation. The
 * tracker records no sugar alcohols, so the row for them says exactly that
 * instead of printing a zero that would claim the foods contained none.
 */
function CarbBreakdownDialog({ totals, goals, standing, onClose }: {
  totals: CarbTotals; goals: NetCarbGoals; standing: ReturnType<typeof netCarbProgress>; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("keydown", keyDown); opener?.focus?.(); };
  }, [onClose]);

  const help = totals.records === 0
    ? "Nothing is logged for today yet."
    : goals.min > 0
      ? `Your net-carb goal is a range of ${netCarbGoalLabel(goals)}. Under the minimum is reported as under the minimum, not as being on track.`
      : "Your net-carb goal is a maximum. Set a minimum in Settings to track a range instead.";

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal compact" ref={panel} tabIndex={-1} onMouseDown={event => event.stopPropagation()}
      role="dialog" aria-modal="true" aria-labelledby="carb-detail-title" aria-describedby="carb-detail-help">
      <div className="modal-head">
        <div><p className="eyebrow">Today</p><h2 id="carb-detail-title">Carbohydrate breakdown</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <dl className="product-meta">
        <div><dt>Net carb goal</dt><dd>{netCarbGoalLabel(goals)}</dd></div>
        <div><dt>{standing.state === "above" ? "Over the maximum by" : standing.state === "below" ? "Below the minimum by" : "Left before the maximum"}</dt>
          <dd className={standing.state === "above" ? "flagged" : ""}>{amount(standing.grams)} g</dd></div>
        <div><dt>Foods counted</dt><dd>{totals.records} {totals.records === 1 ? "item" : "items"}</dd></div>
      </dl>
      <ul className="fat-detail-list">
        <li>
          <span>Total carbohydrates</span><b>{amount(totals.carbs)} g</b>
          <small>Every carbohydrate gram recorded today, fiber included</small>
        </li>
        <li>
          <span>Fiber</span><b>{amount(totals.fiber)} g</b>
          <small>Subtracted from total carbohydrates to give net carbs</small>
        </li>
        <li>
          <span>Sugar alcohols</span><b className="unknown">{UNKNOWN_FAT_LABEL}</b>
          <small>This tracker has no field for sugar alcohols, so none are subtracted</small>
        </li>
        <li>
          <span>Net carbohydrates</span><b>{amount(totals.netCarbs)} g</b>
          <small>Total carbohydrates minus fiber, worked out food by food</small>
        </li>
      </ul>
      <p className="fat-detail-help" id="carb-detail-help">{help}</p>
    </div>
  </div>;
}

/**
 * Today's fat, subtype by subtype.
 *
 * Total fat and its goal are unchanged from the card behind it. A subtype no
 * food recorded says so rather than showing 0 g, and a sum that covers only
 * some of the day's foods says how many it covers. The four are never made to
 * add up to total fat.
 */
function FatBreakdownDialog({ totals, goal, onClose }: { totals: FatTotals; goal: number; onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Focus moves into the dialog and returns to the card when it closes, so a
    // keyboard or screen-reader user is never dropped at the top of the page.
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }
    document.addEventListener("keydown", keyDown);
    return () => { document.removeEventListener("keydown", keyDown); opener?.focus?.(); };
  }, [onClose]);

  const remaining = round(goal - totals.total);
  const detailed = hasFatDetail(totals);
  const complete = totals.records > 0 && fatSubtypeKeys.every(key => totals.missing[key] === 0);
  // Only shown when every food carried every subtype; otherwise the shortfall
  // could just be a subtype nobody reported, which is not "unclassified".
  const other = unclassifiedFat(totals);
  const help = totals.records === 0
    ? "Nothing is logged for today yet."
    : !detailed
      ? "None of today's foods record a fat breakdown, so only total fat is available. Add the subtypes when you enter or edit a food and they will appear here."
      : complete
        ? "Subtypes are not expected to add up to total fat: labels round each line on its own and some fat is never reported as any subtype."
        : "Some of today's foods do not record every subtype, so each amount below covers only the foods that recorded it and the real total is higher.";

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal compact" ref={panel} tabIndex={-1} onMouseDown={event => event.stopPropagation()}
      role="dialog" aria-modal="true" aria-labelledby="fat-detail-title" aria-describedby="fat-detail-help">
      <div className="modal-head">
        <div><p className="eyebrow">Today</p><h2 id="fat-detail-title">Fat breakdown</h2></div>
        <button onClick={onClose} aria-label="Close">×</button>
      </div>
      <dl className="product-meta">
        <div><dt>Total fat</dt><dd>{amount(totals.total)} g</dd></div>
        <div><dt>Daily goal</dt><dd>{amount(goal)} g</dd></div>
        <div><dt>{remaining < 0 ? "Over goal by" : "Remaining"}</dt>
          <dd className={remaining < 0 ? "flagged" : ""}>{amount(Math.abs(remaining))} g</dd></div>
        <div><dt>Foods counted</dt><dd>{totals.records} {totals.records === 1 ? "item" : "items"}</dd></div>
      </dl>
      <ul className="fat-detail-list">
        {fatSubtypeKeys.map(key => <li key={key}>
          <span>{fatSubtypeLabels[key]}</span>
          <b className={totals.subtotals[key] === null ? "unknown" : ""}>{gramsOrUnknown(totals.subtotals[key])}</b>
          <small>{totals.known[key] === 0
            ? "Not recorded on any food today"
            : totals.missing[key] === 0
              ? `From all ${totals.records} ${totals.records === 1 ? "food" : "foods"}`
              : `From ${totals.known[key]} of ${totals.records} foods`}</small>
        </li>)}
        {other !== null && <li>
          <span>Unclassified fat</span>
          <b>{amount(other)} g</b>
          <small>Total fat the four subtypes above do not account for</small>
        </li>}
      </ul>
      <p className="fat-detail-help" id="fat-detail-help">{help}</p>
    </div>
  </div>;
}

/** Type-ahead picker over the profile's own saved foods. */
function SavedFoodPicker({ foods, selectedId, onSelect, onClear }: { foods: Food[]; selectedId: number | null; onSelect: (food: Food) => void; onClear: () => void }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const found = needle ? foods.filter(food => `${food.name} ${food.serving}`.toLowerCase().includes(needle)) : foods;
    return found.slice(0, 60);
  }, [foods, term]);

  function choose(food: Food) { onSelect(food); setTerm(food.name); setOpen(false); }
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      if (matches.length === 0) return;
      setHighlight(current => (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && matches[highlight]) choose(matches[highlight]);
    } else if (event.key === "Escape") { setOpen(false); }
  }

  return <div className="saved-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label className="field-heading" htmlFor="saved-food-input">My saved foods</label>
    <div className="saved-picker-control">
      <input id="saved-food-input" type="text" role="combobox" aria-expanded={open} aria-controls="saved-food-list" aria-autocomplete="list" autoComplete="off"
        value={term} disabled={foods.length === 0}
        placeholder={foods.length === 0 ? "No saved foods yet" : "Type to filter your saved foods…"}
        onFocus={() => setOpen(true)} onChange={event => { setTerm(event.target.value); setHighlight(0); setOpen(true); }} onKeyDown={keyDown} />
      <button type="button" className="saved-picker-toggle" aria-label={open ? "Hide saved foods" : "Show saved foods"} disabled={foods.length === 0}
        onMouseDown={event => event.preventDefault()} onClick={() => setOpen(current => !current)}>{open ? "▴" : "▾"}</button>
      {(term.length > 0 || selectedId !== null) && <button type="button" className="saved-picker-clear" aria-label="Clear saved food"
        onMouseDown={event => event.preventDefault()} onClick={() => { setTerm(""); setHighlight(0); onClear(); setOpen(true); }}>×</button>}
    </div>
    {open && foods.length > 0 && <ul className="saved-picker-list" id="saved-food-list" role="listbox" aria-label="Saved foods">
      {matches.length === 0
        ? <li className="saved-picker-empty">No saved food matches “{term.trim()}”.</li>
        : matches.map((food, index) => <li key={food.id}>
            <button type="button" role="option" aria-selected={food.id === selectedId} className={index === highlight ? "active" : ""}
              onMouseDown={event => event.preventDefault()} onMouseEnter={() => setHighlight(index)} onClick={() => choose(food)}>
              <strong>{food.name}</strong>
              <span>{food.serving} · {round(food.calories)} cal · {round(food.protein)}g protein · {round(food.carbs - food.fiber)}g net</span>
            </button>
          </li>)}
    </ul>}
    <small className="saved-picker-help">Picking a saved food fills in its serving and nutrition for one serving. Adjust Servings eaten below for a partial or double portion.</small>
  </div>;
}

/**
 * Camera scanner backed by ZXing, with manual entry always available.
 *
 * The native BarcodeDetector API is not used: it is unavailable in iPhone
 * Safari, which is the primary target for this screen.
 */
function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  // Guards against the decode loop reporting the same code many times.
  const handledRef = useRef(false);
  const detectedRef = useRef(onDetected);
  const [status, setStatus] = useState<"starting" | "running" | "unavailable">("starting");
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState("");

  useEffect(() => { detectedRef.current = onDetected; });

  /** Stops the decode loop and hands the camera back to the operating system. */
  const release = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* already stopped */ }
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(track => track.stop());
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) { setStatus("unavailable"); setCameraError("This browser cannot open a camera here. Type the barcode below instead."); }
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_8, BarcodeFormat.EAN_13]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current ?? undefined,
          result => {
            if (!result || handledRef.current) return;
            handledRef.current = true;
            release();
            detectedRef.current(result.getText());
          },
        );
        controlsRef.current = controls;
        if (cancelled || handledRef.current) { release(); return; }
        setStatus("running");
      } catch (reason) {
        if (cancelled) return;
        release();
        setStatus("unavailable");
        setCameraError(cameraMessage(reason));
      }
    }
    void start();
    return () => { cancelled = true; release(); };
  }, [release]);

  function close() { handledRef.current = true; release(); onClose(); }
  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = barcodeDigits(manual);
    if (![8, 12, 13, 14].includes(digits.length)) { setManualError("Enter 8, 12, 13, or 14 digits (UPC-A, EAN-8, EAN-13)."); return; }
    handledRef.current = true;
    release();
    detectedRef.current(digits);
  }

  return <div className="modal-backdrop" onMouseDown={close}><div className="modal compact scanner-modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="scan-title">
    <div className="modal-head"><div><p className="eyebrow">Packaged food</p><h2 id="scan-title">Scan barcode</h2></div><button onClick={close} aria-label="Close scanner">×</button></div>
    <div className="scanner-stage">
      <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-label="Camera preview" />
      {status !== "running" && <div className="scanner-overlay">{status === "starting" ? "Starting the camera…" : "Camera unavailable"}</div>}
      {status === "running" && <div className="scanner-reticle" aria-hidden="true" />}
    </div>
    {status === "running" && <p className="scanner-hint">Hold the barcode inside the box. The camera stops as soon as a code is read.</p>}
    {cameraError && <p className="scanner-warning">{cameraError}</p>}
    <form className="food-form scanner-manual" onSubmit={submitManual}>
      <label>Or type the barcode<input value={manual} onChange={event => { setManual(event.target.value); setManualError(""); }} inputMode="numeric" autoComplete="off" placeholder="e.g. 737628064502" /></label>
      {manualError && <p className="form-error">{manualError}</p>}
      <div className="scanner-actions">
        <button type="button" className="secondary" onClick={close}>Cancel</button>
        <button type="submit" className="primary">Look up barcode</button>
      </div>
    </form>
    <p className="scanner-credit">Product data from Open Food Facts (ODbL 1.0).</p>
  </div></div>;
}

function cameraMessage(reason: unknown) {
  const name = reason instanceof Error ? reason.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was blocked. Allow the camera in your browser settings, or type the barcode below.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera was found. Type the barcode below instead.";
  if (name === "NotReadableError") return "The camera is already in use by another app. Close it and try again, or type the barcode below.";
  return "The camera could not be started. Type the barcode below instead.";
}

const MAX_MEAL_DESCRIPTION = 1500;

type Method = "saved" | "describe" | "scan" | "manual";
const methods: { id: Method; label: string; hint: string }[] = [
  { id: "saved", label: "Saved", hint: "Pick something you have logged before." },
  { id: "describe", label: "Describe", hint: "Type or dictate the meal and let the assistant estimate it." },
  { id: "scan", label: "Scan", hint: "Scan a packaged product barcode." },
  { id: "manual", label: "Manual", hint: "Type the nutrition in yourself." },
];
const sourceSummaries: Record<Source, string> = {
  manual: "Entered by hand",
  saved: "From your saved foods",
  barcode: "From the product barcode",
  ai: "AI estimate — check it before saving",
  copy: "Copied from an earlier diary entry",
};

/**
 * Adds one food to `date`.
 *
 * `prefill` is the copy of an existing diary entry. It only fills the form in:
 * nothing is written until this form is submitted, every field stays editable,
 * and the entry it was copied from is never touched. A copy deliberately does
 * not tick "Save this to My Foods" — copying and saving a reusable food are
 * separate actions.
 */
function AddFood({ meal, mealLocked, date, profile, foodsVersion, prefill, copiedFrom, onClose, onSaved }: { meal: Meal; mealLocked: boolean; date: string; profile: Profile; foodsVersion: number; prefill?: FoodValues; copiedFrom?: string; onClose: () => void; onSaved: (entry: Entry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [mealChoice, setMealChoice] = useState<Meal>(meal);
  const [method, setMethod] = useState<Method>(prefill ? "manual" : "saved");
  const [myFoods, setMyFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Draft | null>(prefill ?? null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [source, setSource] = useState<Source>(prefill ? "copy" : "manual");
  // A second tap must not write a second entry, whatever has rendered yet.
  const inFlight = useRef(false);
  // Bumped on every pick so the uncontrolled form remounts with the new values.
  const [selectionKey, setSelectionKey] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanned, setScanned] = useState<ScannedProduct | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [barcodeNotice, setBarcodeNotice] = useState("");
  const [duplicate, setDuplicate] = useState<Food | null>(null);
  const [description, setDescription] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [aiNotice, setAiNotice] = useState("");
  const headers = { "x-food-tracker-profile": profile };
  useEffect(() => {
    fetch("/api/custom-foods", { headers }).then(response => response.json()).then(data => {
      const saved: Food[] = data.foods ?? [];
      setMyFoods(saved);
      // A food deleted from My Foods must not stay linked here. Anything
      // already typed into the form is left alone; only the link is dropped,
      // so the entry still saves and can be saved to My Foods again.
      setSavedId(current => current !== null && !saved.some(food => food.id === current) ? null : current);
      setDuplicate(current => current !== null && !saved.some(food => food.id === current.id) ? null : current);
    }).catch(() => undefined);
  }, [profile, foodsVersion]);

  /** Clears whatever produced the previous prefill so only one source is ever shown. */
  function resetSources() { setScanned(null); setBarcodeNotice(""); setDuplicate(null); setEstimate(null); setAiNotice(""); }

  function pick(food: Draft | null, origin: Source) {
    setSelected(food); setSource(origin);
    setSavedId(origin === "saved" && food?.id !== undefined ? food.id : null);
    setSelectionKey(current => current + 1);
    setBarcode(food?.barcode ? barcodeDigits(food.barcode) : "");
    resetSources();
  }

  /** Asks the server for a Gemini estimate, then prefills the form for review. Nothing is saved. */
  async function estimateMeal() {
    const text = description.trim();
    if (!text) { setAiNotice("Describe your meal first, then tap Estimate Nutrition."); return; }
    setEstimating(true); setAiNotice(""); setEstimate(null); setError("");
    try {
      const response = await fetch("/api/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: text }) });
      const data = await response.json() as { estimate?: MealEstimate; needsDetail?: boolean; message?: string; error?: string };
      if (data.estimate) {
        const result = data.estimate;
        setScanned(null); setBarcodeNotice(""); setDuplicate(null); setBarcode("");
        setEstimate(result); setSource("ai"); setSavedId(null);
        setSelected({
          name: result.foodName, serving: "1 serving",
          calories: result.calories, protein: result.protein, fat: result.fat, carbs: result.carbs, fiber: result.fiber,
          // A subtype the assistant could not determine stays null, so its field
          // renders empty rather than claiming the food contains none.
          saturatedFat: result.saturatedFat, transFat: result.transFat,
          monounsaturatedFat: result.monounsaturatedFat, polyunsaturatedFat: result.polyunsaturatedFat,
        });
        setSelectionKey(current => current + 1);
      } else {
        setAiNotice(data.message ?? data.error ?? "The meal assistant could not answer. Enter the nutrition yourself.");
      }
    } catch {
      setAiNotice("The meal assistant could not be reached. Enter the nutrition yourself and it will still save.");
    } finally {
      setEstimating(false);
    }
  }

  /** Looks the code up, then prefills the form. Nothing is saved until the user confirms. */
  async function lookupBarcode(code: string) {
    const digits = barcodeDigits(code);
    setScannerOpen(false); setLookingUp(true); setError(""); setBarcodeNotice(""); setScanned(null); setEstimate(null); setAiNotice("");
    setBarcode(digits);
    setDuplicate(myFoods.find(food => food.barcode && barcodeDigits(food.barcode) === digits) ?? null);
    try {
      const response = await fetch(`/api/barcode?code=${encodeURIComponent(digits)}`);
      const data = await response.json() as { found?: boolean; product?: ScannedProduct; message?: string; error?: string; barcode?: string };
      if (data.found && data.product) {
        const product = data.product;
        setScanned(product); setSource("barcode");
        setSelected({
          name: product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? `${product.name} · ${product.brand}` : product.name,
          serving: product.serving,
          calories: product.calories ?? undefined, protein: product.protein ?? undefined, fat: product.fat ?? undefined,
          carbs: product.carbs ?? undefined, fiber: product.fiber ?? undefined,
          // Open Food Facts usually carries saturated and trans fat only. The
          // rest stay null and can be typed in below before saving.
          saturatedFat: product.saturatedFat, transFat: product.transFat,
          monounsaturatedFat: product.monounsaturatedFat, polyunsaturatedFat: product.polyunsaturatedFat,
          barcode: product.barcode,
        });
        setSavedId(null); setSelectionKey(current => current + 1);
        setBarcode(product.barcode);
      } else {
        setBarcodeNotice(data.error ?? data.message ?? "That product is not in the Open Food Facts database yet.");
      }
    } catch {
      setBarcodeNotice("Open Food Facts could not be reached. Enter the nutrition yourself and it will still save.");
    } finally {
      setLookingUp(false);
    }
  }

  function useSavedDuplicate() {
    if (!duplicate) return;
    const existing = duplicate;
    setSelected(existing); setSavedId(existing.id); setSource("saved"); setSelectionKey(current => current + 1);
    setBarcode(existing.barcode ? barcodeDigits(existing.barcode) : "");
    resetSources();
    setMethod("saved");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/entries", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...body, eatenOn: date, barcode: barcode || undefined, saveCustom: form.get("saveCustom") === "on" }) });
    const result = await response.json();
    inFlight.current = false;
    if (!response.ok) { setError(result.error ?? "Unable to save food"); setBusy(false); return; }
    onSaved(result.entry);
  }

  const missingLabels = (scanned?.missing ?? []).map(field => nutritionLabels[field] ?? field);
  const missingFatLabels = (scanned?.missingFatDetail ?? []).map(field => nutritionLabels[field] ?? field);
  const activeMethod = methods.find(item => item.id === method) ?? methods[0];

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-title">
    <div className="modal-head"><div><p className="eyebrow">{mealLocked ? mealChoice : "New entry"}</p><h2 id="add-title">{prefill ? "Copy to today" : "Add food"}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    {/* The day being written to is always named, because a copy lands on today
        even when a different day is open behind this form. */}
    <p className="add-target-date">Adding to <strong>{longDate(date)}</strong>{copiedFrom && copiedFrom !== date ? ` · copied from ${longDate(copiedFrom)}` : ""}</p>

    <section className="add-step">
      <p className="step-label"><span aria-hidden="true">1</span> Find your food</p>
      <div className="method-tabs" role="tablist" aria-label="How to add this food">
        {methods.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === method}
          className={item.id === method ? "active" : ""} onClick={() => setMethod(item.id)}>{item.label}</button>)}
      </div>
      <p className="method-hint">{activeMethod.hint}</p>

      <div className="method-panel">
        {method === "saved" && <SavedFoodPicker foods={myFoods} selectedId={savedId} onSelect={food => pick(food, "saved")} onClear={() => pick(null, "manual")} />}

        {method === "describe" && <>
          <label className="sr-label" htmlFor="meal-description">Describe your meal</label>
          <textarea id="meal-description" className="meal-textarea" rows={5} maxLength={MAX_MEAL_DESCRIPTION}
            value={description} onChange={event => { setDescription(event.target.value); setAiNotice(""); }}
            placeholder={"2 leaves of romaine lettuce\n1.5 hamburger patties, 4 oz each, 6 oz total\n1 tablespoon mayonnaise\n1 serving green beans"} />
          <div className="meal-assistant-row">
            <small className="meal-hint">Tap the microphone on your iPhone keyboard to dictate this instead of typing.</small>
            <button type="button" className="estimate-button" onClick={() => void estimateMeal()} disabled={estimating || description.trim().length === 0}>
              {estimating ? "Estimating…" : "Estimate Nutrition"}
            </button>
          </div>
          {estimating && <p className="meal-progress" role="status">Asking the meal assistant… this usually takes a few seconds.</p>}
          {aiNotice && <div className="barcode-notice"><span aria-hidden="true">⚠</span><div><strong>{aiNotice}</strong><p>Your description is still here. Edit it and try again, or fill in the nutrition below yourself.</p></div></div>}
          {estimate && <div className="ai-card">
            <div className="ai-head"><span aria-hidden="true">✧</span><div><strong>AI estimate — review before saving</strong><p>These numbers are an estimate, not exact or medically verified values. Check them and edit anything that looks wrong.</p></div></div>
            <dl className="product-meta">
              <div><dt>Covers</dt><dd>{estimate.serving}</dd></div>
              <div><dt>Confidence</dt><dd className={estimate.confidence === "low" ? "flagged" : ""}>{estimate.confidence}</dd></div>
            </dl>
            <div className="ai-list">
              <p className="ai-list-title">Fat breakdown</p>
              <ul className="ai-fat-list">
                <li><strong>Total fat</strong><span>{amount(estimate.fat)} g</span></li>
                {fatSubtypeKeys.map(key => <li key={key}>
                  <strong>{fatSubtypeLabels[key]}</strong>
                  <span className={estimate[key] === null ? "unknown" : ""}>{gramsOrUnknown(estimate[key])}</span>
                </li>)}
              </ul>
              <p className="ai-fat-note">Anything the assistant could not work out is left blank rather than guessed at zero. Correct or fill in any of these under Fat breakdown below before adding the food.</p>
            </div>
            {estimate.assumptions.length > 0 && <div className="ai-list"><p className="ai-list-title">Assumptions</p><ul>{estimate.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
            {estimate.warnings.length > 0 && <div className="ai-list warnings"><p className="ai-list-title">Warnings</p><ul>{estimate.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
            <p className="ai-tip">A packaged food label or a barcode scan is more accurate than an estimate whenever one is available.</p>
          </div>}
        </>}

        {method === "scan" && <>
          <div className="barcode-row">
            <button type="button" className="scan-button" onClick={() => setScannerOpen(true)} disabled={lookingUp}>
              <span aria-hidden="true">▮</span>{lookingUp ? "Looking up…" : "Scan barcode"}
            </button>
            {barcode && <span className="barcode-chip">Barcode {barcode}</span>}
          </div>
          {barcodeNotice && <div className="barcode-notice"><span aria-hidden="true">⚠</span><div><strong>{barcodeNotice}</strong><p>The barcode is kept{barcode ? ` (${barcode})` : ""}. Fill in the nutrition below and it will be saved with the food.</p></div></div>}
          {duplicate && <div className="barcode-notice duplicate"><span aria-hidden="true">⚠</span><div><strong>You already saved a food for this barcode</strong><p>“{duplicate.name}” is in My Foods. Saving again updates that food instead of creating a second copy.</p><button type="button" onClick={useSavedDuplicate}>Use my saved version</button></div></div>}
          {scanned && <div className="product-card">
            <div className="product-head"><strong>{scanned.name}</strong>{scanned.brand && <span>{scanned.brand}</span>}</div>
            <dl className="product-meta">
              <div><dt>Source</dt><dd>{scanned.source}</dd></div>
              <div><dt>Serving basis</dt><dd className={scanned.servingBasis === "100g" ? "flagged" : ""}>{scanned.servingDescription}</dd></div>
              {scanned.servingAmount !== null && <div><dt>Serving amount</dt><dd>{amount(scanned.servingAmount)} {scanned.servingUnit}</dd></div>}
              {scanned.packageSize && <div><dt>Package</dt><dd>{scanned.packageSize}</dd></div>}
            </dl>
            {missingLabels.length > 0
              ? <p className="product-missing">⚠ Open Food Facts has no {missingLabels.join(", ")} for this product. Those fields are blank below — enter them yourself. Nothing is guessed.</p>
              : <p className="product-complete">✓ All nutrition fields came from the product record. Review them before saving.</p>}
            {missingFatLabels.length > 0
              ? <p className="product-missing">⚠ No {missingFatLabels.join(", ").toLowerCase()} on this product record. Those boxes are blank under Fat breakdown below and stay “not available” unless you fill them in. Nothing is guessed.</p>
              : <p className="product-complete">✓ A full fat breakdown came from the product record.</p>}
            <p className="product-credit">{scanned.attribution}</p>
          </div>}
        </>}

      </div>
    </section>

    <section className="add-step">
      <p className="step-label"><span aria-hidden="true">2</span> Review and add</p>
      <p className={`source-summary${selected ? " loaded" : ""}`}>
        {selected ? <><strong>{selected.name}</strong><span>{sourceSummaries[source]}</span></> : <span>Nothing loaded yet. Type the values in below, or pick a method above.</span>}
      </p>

      <form key={selectionKey} onSubmit={submit} className="food-form">
        {mealLocked
          ? <input type="hidden" name="meal" value={mealChoice} />
          : <label>Meal<select name="meal" value={mealChoice} onChange={event => setMealChoice(event.target.value as Meal)}>{meals.map(item => <option key={item}>{item}</option>)}</select></label>}
        <label>Food name<input name="name" placeholder="e.g. Scrambled eggs" required defaultValue={selected?.name ?? ""} /></label>
        <label>Serving<input name="serving" placeholder="e.g. 4 oz or 1/2 cup" required defaultValue={selected?.serving ?? ""} /></label>
        <label>Servings eaten<input name="servings" type="number" min="0.01" max="100" step="0.01" required defaultValue="1.00" /><small>Use 0.50 for half a serving. Nutrition is adjusted automatically.</small></label>
        <div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="0.01" required defaultValue={selected?.calories} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.01" required defaultValue={selected?.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.01" required defaultValue={selected?.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.01" required defaultValue={selected?.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.01" required defaultValue={selected?.fiber} /></label></div>
        <FatFields key={`fat-${selectionKey}`} values={selected ?? {}} />
        {/* Always starts unticked, whatever the food came from, so a one-off
            meal never quietly joins My Foods. */}
        {savedId === null && <label className="checkbox-row"><input name="saveCustom" type="checkbox" /><span>{source === "ai" ? "Save to My Foods" : "Save this to My Foods"}</span></label>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : `Add to ${mealChoice}`}</button>
      </form>
    </section>

    {scannerOpen && <BarcodeScanner onDetected={code => void lookupBarcode(code)} onClose={() => setScannerOpen(false)} />}
  </div></div>;
}

const MAX_WATER_OUNCES = 256;
/** Mirrors the API rule: positive, capped, and no more than two decimal places. */
function validShortcut(value: number) {
  return Number.isFinite(value) && value > 0 && value <= MAX_WATER_OUNCES && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

/**
 * One goal input with its live percentage note.
 *
 * The note sits inside the label, so a screen reader announces "Protein (g),
 * 28.6% of calories" as the field's name and the two never separate.
 */
function GoalField({ name, label, note, value, min = "1", step = "1", onChange }: {
  name: string; label: string; note: string; value: string; min?: string; step?: string;
  onChange: (value: string) => void;
}) {
  return <label>
    <span className="goal-field-label">{label}{note && <small>{note}</small>}</span>
    <input name={name} type="number" min={min} step={step} inputMode="decimal" value={value}
      onChange={event => onChange(event.target.value)} />
  </label>;
}

function SettingsEditor({ goals, profile, onClose, onSaved }: { goals: Goals; profile: Profile; onClose: () => void; onSaved: (goals: Goals) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  // The goal fields are controlled so their percentages recalculate as they
  // are typed. Nothing stored is changed by this; it is display only until the
  // form is saved.
  const [draft, setDraft] = useState({
    calories: String(goals.calories),
    netCarbsMin: String(netCarbGoalsFrom(goals).min),
    netCarbsMax: String(netCarbGoalsFrom(goals).max),
    protein: String(goals.protein),
    fat: String(goals.fat),
    saturatedFat: goals.saturatedFat === null ? "" : String(goals.saturatedFat),
    fiber: String(goals.fiber),
    waterOunces: String(goals.waterOunces),
  });
  const field = (key: keyof typeof draft) => (value: string) => setDraft(current => ({ ...current, [key]: value }));
  /** A half-typed, blank, zero, or negative box has no percentage to show. */
  const entered = (value: string) => {
    const text = value.trim();
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const context = goalContext({
    calories: entered(draft.calories), netCarbs: entered(draft.netCarbsMax),
    netCarbsMin: entered(draft.netCarbsMin), netCarbsMax: entered(draft.netCarbsMax),
    protein: entered(draft.protein),
    fat: entered(draft.fat), saturatedFat: entered(draft.saturatedFat), fiber: entered(draft.fiber),
  });
  /**
   * The range as it is being typed, so an impossible one is reported before
   * the form is submitted rather than only after a failed save. The same
   * reader the API uses is called here, so the two cannot disagree.
   */
  const rangeCheck = readNetCarbGoals({ netCarbsMin: draft.netCarbsMin, netCarbsMax: draft.netCarbsMax });
  const rangeNote = rangeCheck.ok
    ? rangeCheck.value.min > 0
      ? `Target range ${netCarbGoalLabel(rangeCheck.value)}`
      : "No minimum: this is a maximum only"
    : rangeCheck.error;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    // The net-carb range is checked before anything is sent, with the same
    // reader the API uses, so an impossible range never reaches the database.
    const range = readNetCarbGoals({ netCarbsMin: form.get("netCarbsMin"), netCarbsMax: form.get("netCarbsMax") });
    if (!range.ok) { setError(range.error); return; }
    // Blank stays blank: an unset saturated-fat goal is null, never zero.
    const saturatedRaw = String(form.get("saturatedFat") ?? "").trim();
    const next: Goals = {
      calories: Number(form.get("calories")), protein: Number(form.get("protein")), fat: Number(form.get("fat")),
      // `netCarbs` stays the maximum, which is what the single goal has always
      // meant, so nothing still reading that one field reads a wrong number.
      netCarbs: range.value.max, netCarbsMin: range.value.min, netCarbsMax: range.value.max,
      saturatedFat: saturatedRaw === "" ? null : Number(saturatedRaw),
      fiber: Number(form.get("fiber")), waterOunces: Number(form.get("waterOunces")),
      waterShortcutOne: Number(form.get("waterShortcutOne")), waterShortcutTwo: Number(form.get("waterShortcutTwo")), waterShortcutThree: Number(form.get("waterShortcutThree")),
    };
    if ([next.waterShortcutOne, next.waterShortcutTwo, next.waterShortcutThree].some(value => !validShortcut(value))) {
      setError(`Water shortcuts must be positive numbers up to ${MAX_WATER_OUNCES} with no more than two decimal places.`);
      return;
    }
    if (next.saturatedFat !== null && !(next.saturatedFat > 0)) {
      setError("The saturated fat goal must be more than zero, or left blank for no goal.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/goals", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify({ ...next, today: localDate() }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Unable to save settings"); setBusy(false); return; }
    onSaved(next);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="modal-head"><div><p className="eyebrow">Personalize</p><h2>Settings</h2></div><button onClick={onClose}>×</button></div>
    <div className="coming-soon"><span>✓</span><div><strong>These settings belong to {profileNames[profile]}</strong><p>Goals and water shortcuts are stored per profile, so the other profile is never changed.</p></div></div>
    <form onSubmit={submit} className="food-form">
      <p className="field-heading">Daily goals</p>
      <div className="form-grid">
        <GoalField name="calories" label="Calories" note={context.calories} value={draft.calories} onChange={field("calories")} />
        <GoalField name="netCarbsMin" label="Net carbs minimum (g)" note="lowest of the range" value={draft.netCarbsMin} min="0" step="0.01" onChange={field("netCarbsMin")} />
        <GoalField name="netCarbsMax" label="Net carbs maximum (g)" note={context.netCarbs} value={draft.netCarbsMax} step="0.01" onChange={field("netCarbsMax")} />
        <GoalField name="protein" label="Protein (g)" note={context.protein} value={draft.protein} step="0.01" onChange={field("protein")} />
        <GoalField name="fat" label="Total fat (g)" note={context.fat} value={draft.fat} step="0.01" onChange={field("fat")} />
        <GoalField name="saturatedFat" label="Saturated fat (g)" note={context.saturatedFat || "optional"} value={draft.saturatedFat} min="0.01" step="0.01" onChange={field("saturatedFat")} />
        <GoalField name="fiber" label="Fiber (g)" note={context.fiber} value={draft.fiber} step="0.01" onChange={field("fiber")} />
        <GoalField name="waterOunces" label="Water (oz)" note={context.waterOunces} value={draft.waterOunces} step="0.01" onChange={field("waterOunces")} />
      </div>
      <p className={`goal-range-note${rangeCheck.ok ? "" : " invalid"}`} aria-live="polite">{rangeNote}</p>
      <small className="field-help">
        Percentages update as you type. Protein, total fat, and saturated fat show their share of the calorie goal;
        net carbs show a calorie-equivalent for the maximum, because net carbs exclude fiber and there is no
        total-carbohydrate goal. They are not meant to add up to 100%. Fiber is a gram goal, not a calorie share,
        and the saturated fat goal is optional — leave it blank for no goal.
      </small>
      <small className="field-help">
        Net carbs are a range. Set the minimum to 0 for a maximum only, which is how a single net-carb goal has
        always worked. The minimum cannot be higher than the maximum, and staying below the minimum is reported as
        being below it rather than as being on track.
      </small>
      <p className="field-heading spaced">Water shortcut buttons</p>
      <div className="form-grid three"><label>Shortcut 1 (oz)<input name="waterShortcutOne" type="number" min="0.01" max={MAX_WATER_OUNCES} step="0.01" required defaultValue={amount(goals.waterShortcutOne)} /></label><label>Shortcut 2 (oz)<input name="waterShortcutTwo" type="number" min="0.01" max={MAX_WATER_OUNCES} step="0.01" required defaultValue={amount(goals.waterShortcutTwo)} /></label><label>Shortcut 3 (oz)<input name="waterShortcutThree" type="number" min="0.01" max={MAX_WATER_OUNCES} step="0.01" required defaultValue={amount(goals.waterShortcutThree)} /></label></div>
      <small className="field-help">These replace the +6, +8, and +12 buttons on the hydration card. The +Other button always stays available.</small>
      {error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </form>
  </div></div>;
}

function CustomWater({ onClose, onAdd }: { onClose: () => void; onAdd: (ounces: number) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const ounces = Number(new FormData(event.currentTarget).get("ounces")); if (ounces > 0 && ounces <= 256) onAdd(Math.round(ounces * 100) / 100); }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Hydration</p><h2>Add water</h2></div><button onClick={onClose}>×</button></div><form className="food-form" onSubmit={submit}><label>Number of ounces<input name="ounces" type="number" min="0.01" max="256" step="0.01" required autoFocus /></label><button className="primary">Add water</button></form></div></div>;
}

const MAX_ACTIVITY_DESCRIPTION = 2000;
const MAX_ACTIVITY_COMMENTS = 2000;
const MAX_ACTIVITY_MINUTES = 1440;
const MAX_ACTIVITY_CALORIES = 10000;

/**
 * An activity's comments in the day's list.
 *
 * A dictated gym write-up can run for a paragraph, so anything long is clamped
 * to a couple of lines until it is opened. That keeps the daily summary short
 * without hiding what was written.
 */
function ActivityComment({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 130 || text.includes("\n");
  if (!long) return <p className="activity-comment">{text}</p>;
  return <>
    <p className={open ? "activity-comment" : "activity-comment clamped"}>{text}</p>
    <button type="button" className="activity-comment-toggle" onClick={() => setOpen(current => !current)}>
      {open ? "Show less" : "Show more"}
    </button>
  </>;
}

/** The shared name, minutes, calories, and comments fields of an activity. */
function ActivityFields({ draft }: { draft: { activity: string; minutes: string; calories: string; comments: string } }) {
  return <>
    <label>Activity<input name="activity" placeholder="e.g. Walking" maxLength={100} required defaultValue={draft.activity} /></label>
    <div className="form-grid">
      <label>Minutes<input name="minutes" type="number" min="1" max={MAX_ACTIVITY_MINUTES} step="1" required defaultValue={draft.minutes} /></label>
      <label>Calories burned (optional)<input name="calories" type="number" min="0" max={MAX_ACTIVITY_CALORIES} step="1" defaultValue={draft.calories} /></label>
    </div>
    <label className="activity-comments-field">Comments (optional)
      <textarea name="comments" className="meal-textarea activity-textarea" rows={4} maxLength={MAX_ACTIVITY_COMMENTS} defaultValue={draft.comments}
        placeholder="Sets, reps, distances, how it felt — anything worth remembering." />
      <small>Up to {MAX_ACTIVITY_COMMENTS} characters. Tap the microphone on your iPhone keyboard to dictate this.</small>
    </label>
  </>;
}

/** Everything the assistant proposed, shown for review before anything is saved. */
function ActivityEstimateCard({ estimate, onDismiss }: { estimate: ActivityEstimate; onDismiss: () => void }) {
  return <div className="ai-card">
    <div className="ai-head"><span aria-hidden="true">✧</span><div><strong>AI estimate — review before saving</strong><p>Nothing has been added to your diary. Check the name, minutes, calories, and comments below and edit anything that looks wrong.</p></div></div>
    <dl className="product-meta">
      <div><dt>Active minutes</dt><dd>{amount(estimate.totalMinutes)} min</dd></div>
      <div><dt>Calories burned</dt><dd>{amount(estimate.totalCalories)}</dd></div>
      <div><dt>Confidence</dt><dd className={estimate.confidence === "low" ? "flagged" : ""}>{estimate.confidence}</dd></div>
      <div><dt>Body weight used</dt><dd className={estimate.weight.fallback ? "flagged" : ""}>{amount(estimate.weight.pounds)} lb</dd></div>
    </dl>
    <p className="ai-weight">
      Estimated using a body weight of {amount(estimate.weight.pounds)} lb, recorded {mediumDate(estimate.weight.weighedOn)}.
      {estimate.weight.fallback ? " That is your earliest reading, because nothing was logged on or before this date." : ""}
    </p>
    <div className="ai-list">
      <p className="ai-list-title">Segments used</p>
      <ul className="activity-segments">
        {estimate.segments.map((segment, index) => <li key={index}>
          <strong>{segment.name}</strong>
          <span>{amount(segment.minutes)} min · {segment.intensity} · MET {amount(segment.met)} · {amount(segment.calories)} cal</span>
          {segment.assumptions && <em>{segment.assumptions}</em>}
        </li>)}
      </ul>
    </div>
    {estimate.assumptions.length > 0 && <div className="ai-list"><p className="ai-list-title">Assumptions</p><ul>{estimate.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {estimate.warnings.length > 0 && <div className="ai-list warnings"><p className="ai-list-title">Warnings</p><ul>{estimate.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    <p className="ai-tip">Calories are worked out here from {estimate.formula}, not taken from the assistant. Change the minutes or calories below if you know better.</p>
    <button type="button" className="ai-dismiss" onClick={onDismiss}>Dismiss this estimate</button>
  </div>;
}

const emptyActivityDraft = { activity: "", minutes: "", calories: "", comments: "" };

/**
 * Adds one activity, either typed in by hand or started from a described
 * workout that Gemini breaks into segments.
 *
 * The estimate only fills the form in. Saving is always a separate, deliberate
 * step, and the whole form keeps working if the assistant is unavailable.
 */
function AddExercise({ date, profile, onClose, onSaved }: { date: string; profile: Profile; onClose: () => void; onSaved: (entry: ExerciseEntry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<ActivityEstimate | null>(null);
  const [aiNotice, setAiNotice] = useState("");
  const [draft, setDraft] = useState(emptyActivityDraft);
  // Bumped whenever an estimate arrives so the uncontrolled form remounts.
  const [draftKey, setDraftKey] = useState(0);
  const headers = { "x-food-tracker-profile": profile };

  /** Asks the server for an estimate and prefills the form. Nothing is saved. */
  async function estimateActivity() {
    const text = description.trim();
    if (!text) { setAiNotice("Describe your activity first, then tap Estimate Activity."); return; }
    setEstimating(true); setAiNotice(""); setEstimate(null); setError("");
    try {
      const response = await fetch("/api/estimate-activity", {
        method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ description: text, exercisedOn: date }),
      });
      const data = await response.json() as { estimate?: ActivityEstimate; needsDetail?: boolean; needsWeight?: boolean; message?: string; error?: string };
      if (data.estimate) {
        const result = data.estimate;
        setEstimate(result);
        setDraft({
          activity: result.activityName,
          minutes: String(result.totalMinutes),
          calories: String(Math.round(result.totalCalories)),
          comments: result.comments,
        });
        setDraftKey(current => current + 1);
      } else {
        setAiNotice(data.message ?? data.error ?? "The activity assistant could not answer. Fill the activity in yourself.");
      }
    } catch {
      // The description stays exactly as it was typed, so nothing dictated is lost.
      setAiNotice("The activity assistant could not be reached. Fill the activity in yourself and it will still save.");
    } finally {
      setEstimating(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const comments = String(form.get("comments") ?? "");
    if (comments.trim().length > MAX_ACTIVITY_COMMENTS) {
      setError(`Keep the comments to ${MAX_ACTIVITY_COMMENTS} characters or fewer`); setBusy(false); return;
    }
    const response = await fetch("/api/exercise", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ exercisedOn: date, activity: form.get("activity"), minutes: Number(form.get("minutes")), calories: Number(form.get("calories") || 0), comments }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to add exercise"); setBusy(false); return; }
    onSaved(result.entry);
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="activity-title">
    <div className="modal-head"><div><p className="eyebrow">Movement</p><h2 id="activity-title">Add exercise</h2></div><button onClick={onClose} aria-label="Close">×</button></div>

    <section className="add-step">
      <p className="step-label"><span aria-hidden="true">1</span> Describe it, or skip to step 2</p>
      <label className="sr-label" htmlFor="activity-description">Describe your activity</label>
      <textarea id="activity-description" className="meal-textarea" rows={5} maxLength={MAX_ACTIVITY_DESCRIPTION}
        value={description} onChange={event => { setDescription(event.target.value); setAiNotice(""); }}
        placeholder="Gym from 6:03 to 6:38. Treadmill warmup 10 minutes, 0.42 miles, incline 1. Bar squats with the empty bar, 4 sets of 6 to 8. Hammer Strength curls at 25 pounds, 5 sets of 10. Treadmill cooldown 8 minutes, incline 3." />
      <div className="meal-assistant-row">
        <small className="meal-hint">Tap the microphone on your iPhone keyboard to dictate this instead of typing.</small>
        <button type="button" className="estimate-button" onClick={() => void estimateActivity()} disabled={estimating || description.trim().length === 0}>
          {estimating ? "Estimating…" : "Estimate Activity"}
        </button>
      </div>
      {estimating && <p className="meal-progress" role="status">Working out your segments… this usually takes a few seconds.</p>}
      {aiNotice && <div className="barcode-notice"><span aria-hidden="true">⚠</span><div><strong>{aiNotice}</strong><p>Your description is still here. Edit it and try again, or fill the activity in below yourself.</p></div></div>}
      {estimate && <ActivityEstimateCard estimate={estimate} onDismiss={() => { setEstimate(null); setDraft(emptyActivityDraft); setDraftKey(current => current + 1); }} />}
    </section>

    <section className="add-step">
      <p className="step-label"><span aria-hidden="true">2</span> Review and add</p>
      <p className={`source-summary${estimate ? " loaded" : ""}`}>
        {estimate ? <><strong>{estimate.activityName}</strong><span>AI estimate — check it before saving</span></> : <span>Nothing loaded yet. Type the activity in below, or describe it above.</span>}
      </p>
      <form key={draftKey} className="food-form activity-form" onSubmit={submit}>
        <ActivityFields draft={draft} />
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Add exercise"}</button>
      </form>
    </section>
  </div></div>;
}

/**
 * Corrects one saved activity, comments and date included.
 *
 * Every field is sent together, so editing the minutes keeps the comments and
 * editing the comments keeps the minutes. Changing the date moves the activity
 * to that day: the same row is updated, so it is a move and never a second
 * copy sitting on the old day.
 */
function EditExercise({ entry, profile, onClose, onSaved }: { entry: ExerciseEntry; profile: Profile; onClose: () => void; onSaved: (entry: ExerciseEntry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const comments = String(form.get("comments") ?? "");
    if (comments.trim().length > MAX_ACTIVITY_COMMENTS) {
      setError(`Keep the comments to ${MAX_ACTIVITY_COMMENTS} characters or fewer`); return;
    }
    const exercisedOn = String(form.get("exercisedOn") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exercisedOn)) { setError("Choose a valid date for this activity"); return; }
    inFlight.current = true;
    setBusy(true); setError("");
    const response = await fetch("/api/exercise", {
      method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
      body: JSON.stringify({ id: entry.id, exercisedOn, activity: form.get("activity"), minutes: Number(form.get("minutes")), calories: Number(form.get("calories") || 0), comments }),
    });
    const result = await response.json();
    inFlight.current = false;
    if (!response.ok) { setError(result.error ?? "Unable to update exercise"); setBusy(false); return; }
    onSaved(result.entry);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true">
    <div className="modal-head"><div><p className="eyebrow">Movement</p><h2>Edit activity</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <form className="food-form activity-form" onSubmit={submit}>
      <label>Date<input name="exercisedOn" type="date" required defaultValue={entry.exercisedOn} /><small>Changing this moves the activity to that day.</small></label>
      <ActivityFields draft={{ activity: entry.activity, minutes: String(entry.minutes), calories: String(entry.calories), comments: entry.comments }} />
      {error && <p className="form-error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save activity"}</button>
    </form>
  </div></div>;
}
