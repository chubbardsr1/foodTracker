"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Profile = "chris" | "sarah";
type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
type Entry = { id: number; eatenOn: string; meal: Meal; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type WaterEntry = { id: number; drankOn: string; ounces: number };
type ExerciseEntry = { id: number; exercisedOn: string; activity: string; minutes: number; calories: number };
type WeightEntry = { id: number; weighedOn: string; pounds: number; note: string };
type JournalEntry = { id: number; entryOn: string; body: string; source: string; updatedAt: string };
type Food = { id: number; name: string; serving: string; servingGrams?: number; calories: number; protein: number; fat: number; carbs: number; fiber: number; barcode?: string | null };
/** Prefill for the Add Food form. Missing nutrition stays undefined so the field renders empty. */
type Draft = { id?: number; name: string; serving: string; calories?: number; protein?: number; fat?: number; carbs?: number; fiber?: number; barcode?: string | null };
type Source = "manual" | "saved" | "usda" | "barcode" | "ai";
type MealEstimate = {
  foodName: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number;
  assumptions: string[]; confidence: string; warnings: string[];
};
type ScannedProduct = {
  barcode: string; name: string; brand: string; serving: string; servingDescription: string;
  servingAmount: number | null; servingUnit: string; servingBasis: "serving" | "100g"; packageSize: string;
  calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null;
  missing: string[]; source: string; attribution: string;
};
type Goals = { calories: number; protein: number; fat: number; netCarbs: number; fiber: number; waterOunces: number; waterShortcutOne: number; waterShortcutTwo: number; waterShortcutThree: number };
type View = "diary" | "foods" | "reports" | "calendar" | "weight" | "journal";
type CalendarDay = {
  date: string; calories: number; items: number; goalCalories: number; goalSource: "saved" | "current";
  remaining: number; status: "none" | "under" | "over" | "way-over";
  exerciseMinutes: number; exerciseCalories: number; sessions: number; activities: string;
  hasMovement: boolean; hasData: boolean;
};
type ReportDay = { date: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; netCarbs: number; items: number; exerciseMinutes: number; exerciseCalories: number; sessions: number; activities: string };
type ReportTotals = { calories: number; exerciseMinutes: number; exerciseCalories: number; sessions: number; daysInRange: number; daysWithFood: number; daysWithExercise: number };
type ReportAverages = { caloriesPerDay: number; caloriesPerLoggedDay: number; exerciseMinutesPerDay: number };

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const defaultGoals: Goals = { calories: 1600, protein: 110, fat: 105, netCarbs: 25, fiber: 25, waterOunces: 64, waterShortcutOne: 6, waterShortcutTwo: 8, waterShortcutThree: 12 };
const profileNames: Record<Profile, string> = { chris: "Chris", sarah: "Sarah" };
const views: { id: View; label: string; title: string; eyebrow: string }[] = [
  { id: "diary", label: "Diary", title: "Nourish", eyebrow: "Daily Food Tracker" },
  { id: "foods", label: "My Foods", title: "My Foods", eyebrow: "Reusable entries" },
  { id: "calendar", label: "Calendar", title: "Calendar", eyebrow: "Day by day" },
  { id: "reports", label: "Reports", title: "Reports", eyebrow: "Calories & movement" },
  { id: "weight", label: "Weight", title: "Weight", eyebrow: "Your weight log" },
  { id: "journal", label: "Journal", title: "Journal", eyebrow: "Daily recap" },
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
function isoDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function localDate() { return isoDate(new Date()); }
function addDays(date: string, days: number) { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); return isoDate(next); }
function round(value: number) { return Math.round(value * 10) / 10; }
/** Trims trailing zeros so 6 shows as "6" and 7.50 shows as "7.5". */
function amount(value: number) { return String(Math.round(value * 100) / 100); }
const nutritionLabels: Record<string, string> = { calories: "Calories", protein: "Protein", fat: "Fat", carbs: "Total carbs", fiber: "Fiber" };
const barcodeDigits = (value: string) => value.replace(/\D/g, "");
function monthKey(date: string) { return date.slice(0, 7); }
function shiftMonth(month: string, step: number) {
  const [year, index] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, index - 1 + step, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) { return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }); }
function longDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function shortDate(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function weekdayLabel(date: string) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }); }

export default function FoodTracker() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [loading, setLoading] = useState(true);
  // `locked` is true when the meal is already known, e.g. the + on a meal card.
  const [addTarget, setAddTarget] = useState<{ meal: Meal; locked: boolean } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [view, setView] = useState<View>("diary");
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");

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
      const [foodResponse, waterResponse, exerciseResponse] = await Promise.all([
        fetch(`/api/entries?date=${day}`, { headers }),
        fetch(`/api/water?date=${day}`, { headers }),
        fetch(`/api/exercise?date=${day}`, { headers }),
      ]);
      const foodData = await foodResponse.json();
      const waterData = await waterResponse.json();
      const exerciseData = await exerciseResponse.json();
      if (!foodResponse.ok) throw new Error(foodData.error ?? "Unable to load entries");
      if (!waterResponse.ok) throw new Error(waterData.error ?? "Unable to load water");
      if (!exerciseResponse.ok) throw new Error(exerciseData.error ?? "Unable to load exercise");
      setEntries(foodData.entries ?? []);
      setWater(waterData.entries ?? []);
      setExercise(exerciseData.entries ?? []);
      setGoals({ ...defaultGoals, ...(foodData.goals ?? {}) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load this day"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadDay(date); }, [date, profile]);

  const totals = useMemo(() => entries.reduce((sum, item) => ({
    calories: sum.calories + item.calories, protein: sum.protein + item.protein,
    fat: sum.fat + item.fat, carbs: sum.carbs + item.carbs, fiber: sum.fiber + item.fiber,
    netCarbs: sum.netCarbs + Math.max(0, item.carbs - item.fiber),
  }), { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 }), [entries]);
  const waterTotal = water.reduce((sum, item) => sum + item.ounces, 0);
  const exerciseMinutes = exercise.reduce((sum, item) => sum + item.minutes, 0);
  const exerciseCalories = exercise.reduce((sum, item) => sum + item.calories, 0);

  function selectProfile(next: Profile) {
    window.localStorage.setItem("foodTrackerProfile", next);
    setEntries([]); setWater([]); setExercise([]); setGoals(defaultGoals); setProfile(next);
  }
  function shiftDate(days: number) { setDate(addDays(date, days)); }
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
      <div className="brand-mark">N</div>
      <div><p className="eyebrow">{active.eyebrow}</p><h1>{active.title}</h1></div>
      <button className="profile-button" onClick={() => { window.localStorage.removeItem("foodTrackerProfile"); setProfile(null); }} aria-label="Switch profile">
        <span>{profileNames[profile].charAt(0)}</span>{profileNames[profile]}
      </button>
      <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">⚙</button>
    </header>
    <nav className="view-nav" aria-label="Sections">
      {views.map(item => <button key={item.id} type="button" className={item.id === view ? "active" : ""} aria-current={item.id === view ? "page" : undefined} onClick={() => setView(item.id)}>{item.label}</button>)}
    </nav>
    {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}

    {view === "foods" && <MyFoodsPage profile={profile} />}
    {view === "calendar" && <CalendarPage profile={profile} onOpenDay={date => { setDate(date); setView("diary"); }} />}
    {view === "reports" && <ReportsPage profile={profile} />}
    {view === "weight" && <WeightPage profile={profile} />}
    {view === "journal" && <JournalPage profile={profile} />}

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
      <section className="macro-grid">
        <Macro label="Net carbs" value={round(totals.netCarbs)} goal={goals.netCarbs} color="purple" />
        <Macro label="Protein" value={round(totals.protein)} goal={goals.protein} color="coral" />
        <Macro label="Fat" value={round(totals.fat)} goal={goals.fat} color="gold" />
        <Macro label="Fiber" value={round(totals.fiber)} goal={goals.fiber} color="green" />
      </section>
      <section className="exercise-card">
        <div className="exercise-heading"><div className="exercise-icon">↗</div><div><p className="eyebrow">Movement</p><h2>{round(exerciseMinutes)} <small>minutes</small></h2></div><button onClick={() => setExerciseOpen(true)}>+ Add exercise</button></div>
        <p className="exercise-summary">{exerciseCalories > 0 ? `${Math.round(exerciseCalories)} estimated calories burned` : exercise.length > 0 ? "Exercise logged for today" : "No exercise logged yet"}</p>
        {exercise.length > 0 && <div className="exercise-history">{exercise.map(item => <div key={item.id}><span><strong>{item.activity}</strong><small>{round(item.minutes)} min{item.calories > 0 ? ` · ${Math.round(item.calories)} cal` : ""}</small></span><button onClick={() => void removeExercise(item.id)} aria-label={`Remove ${item.activity}`}>×</button></div>)}</div>}
      </section>
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
            <div className="meal-title"><div className={`meal-icon ${meal.toLowerCase()}`}>{meal === "Breakfast" ? "☀" : meal === "Lunch" ? "◐" : meal === "Dinner" ? "☾" : "✦"}</div><div><h3>{meal}</h3><span>{Math.round(calories)} calories</span></div><button onClick={() => setAddTarget({ meal, locked: true })} aria-label={`Add food to ${meal}`}>+</button></div>
            {items.length === 0 ? <button className="empty-meal" onClick={() => setAddTarget({ meal, locked: true })}>Add your first food</button> : items.map(item => <div className="food-row" key={item.id}><div><strong>{item.name}</strong><span>{item.serving} · {round(item.carbs - item.fiber)}g net carbs</span></div><b>{round(item.calories)}</b><button onClick={() => setEditingEntry(item)} aria-label={`Edit ${item.name}`}>✎</button><button onClick={() => void removeEntry(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}
          </article>;
        })}
      </section>
      <button className="floating-add" onClick={() => setAddTarget({ meal: defaultMealForNow(), locked: false })}><span>＋</span> Add food</button>
    </>}

    {addTarget && <AddFood meal={addTarget.meal} mealLocked={addTarget.locked} date={date} profile={profile} onClose={() => setAddTarget(null)} onSaved={(entry) => { setEntries(current => [...current, entry]); setAddTarget(null); }} />}
    {settingsOpen && <SettingsEditor goals={goals} profile={profile} onClose={() => setSettingsOpen(false)} onSaved={(next) => { setGoals(next); setSettingsOpen(false); }} />}
    {customWaterOpen && <CustomWater onClose={() => setCustomWaterOpen(false)} onAdd={(ounces) => { void addWater(ounces); setCustomWaterOpen(false); }} />}
    {exerciseOpen && <AddExercise date={date} profile={profile} onClose={() => setExerciseOpen(false)} onSaved={(entry) => { setExercise(current => [...current, entry]); setExerciseOpen(false); }} />}
    {editingEntry && <EditDiaryEntry entry={editingEntry} profile={profile} onClose={() => setEditingEntry(null)} onSaved={(entry) => { setEntries(current => current.map(item => item.id === entry.id ? entry : item)); setEditingEntry(null); }} />}
  </main>;
}

function MyFoodsPage({ profile }: { profile: Profile }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [editing, setEditing] = useState<Food | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  useEffect(() => {
    fetch("/api/custom-foods", { headers }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load saved foods");
      setFoods(data.foods ?? []);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load saved foods")).finally(() => setLoading(false));
  }, [headers]);
  return <section className="saved-food-page">
    <div className="section-heading"><div><p className="eyebrow">Reusable entries</p><h2>Saved foods</h2></div><span>{foods.length} {foods.length === 1 ? "food" : "foods"}</span></div>
    <p className="page-help">Changes here apply the next time you use a saved food. Previous diary entries remain unchanged.</p>
    {error && <p className="form-error">{error}</p>}
    {loading ? <div className="empty-state">Loading saved foods…</div> : foods.length === 0 ? <div className="empty-state">No saved foods yet.</div> : <div className="saved-food-list">{foods.map(food => <article className="saved-food-card" key={food.id}><div><strong>{food.name}</strong><span>{food.serving}</span><small>{round(food.calories)} cal · {round(food.protein)}g protein · {round(food.carbs - food.fiber)}g net carbs</small></div><button onClick={() => setEditing(food)}>Edit</button></article>)}</div>}
    {editing && <EditSavedFood food={editing} profile={profile} onClose={() => setEditing(null)} onSaved={(food) => { setFoods(current => current.map(item => item.id === food.id ? food : item)); setEditing(null); }} />}
  </section>;
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
          aria-label={`${longDate(day.date)}: ${day.items > 0 ? `${Math.round(day.calories)} calories against a ${day.goalCalories} goal, ${statusLabels[day.status]}` : "nothing logged"}, ${day.hasMovement ? `${round(day.exerciseMinutes)} minutes of movement` : "no movement"}`}>
          <span className="calendar-date">{Number(day.date.slice(8))}</span>
          <span className="calendar-calories">{day.items > 0 ? Math.round(day.calories) : ""}</span>
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
  const today = localDate();
  const [start, setStart] = useState(addDays(today, -6));
  const [end, setEnd] = useState(today);
  const [report, setReport] = useState<{ key: string; days: ReportDay[]; totals: ReportTotals | null; averages: ReportAverages | null } | null>(null);
  const [error, setError] = useState("");
  const headers = useMemo(() => ({ "x-food-tracker-profile": profile }), [profile]);
  const rangeInvalid = start > end;
  const rangeKey = `${profile}:${start}:${end}`;

  useEffect(() => {
    if (rangeInvalid) return;
    let active = true;
    fetch(`/api/reports?start=${start}&end=${end}`, { headers })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to build the report"); return data; })
      .then(data => { if (!active) return; setError(""); setReport({ key: rangeKey, days: data.days ?? [], totals: data.totals ?? null, averages: data.averages ?? null }); })
      .catch(reason => { if (!active) return; setError(reason instanceof Error ? reason.message : "Unable to build the report"); setReport({ key: rangeKey, days: [], totals: null, averages: null }); });
    return () => { active = false; };
  }, [rangeKey, rangeInvalid, start, end, headers]);

  // The report belongs to the range currently on screen only when the keys match.
  const ready = report?.key === rangeKey;
  const days = ready ? report.days : [];
  const totals = ready ? report.totals : null;
  const averages = ready ? report.averages : null;
  const loading = !rangeInvalid && !ready;

  function applyLastDays(count: number) { const last = localDate(); setStart(addDays(last, -(count - 1))); setEnd(last); }
  const maxCalories = days.reduce((high, day) => Math.max(high, day.calories), 0);
  const maxMinutes = days.reduce((high, day) => Math.max(high, day.exerciseMinutes), 0);

  return <section className="report-page">
    <div className="section-heading"><div><p className="eyebrow">{profileNames[profile]} only</p><h2>Calories & movement</h2></div><span>{days.length} {days.length === 1 ? "day" : "days"}</span></div>
    <p className="page-help">Every date in the range is listed. Days without entries show zero.</p>

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
          <thead><tr><th scope="col">Day</th><th scope="col">Calories</th><th scope="col">Minutes</th><th scope="col">Burned</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date} className={day.items === 0 && day.sessions === 0 ? "report-empty-day" : ""}>
            <th scope="row"><strong>{weekdayLabel(day.date)} {shortDate(day.date)}</strong>{day.activities && <small>{day.activities}</small>}</th>
            <td>{amount(day.calories)}</td><td>{amount(day.exerciseMinutes)}</td><td>{amount(day.exerciseCalories)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td>{amount(totals?.calories ?? 0)}</td><td>{amount(totals?.exerciseMinutes ?? 0)}</td><td>{amount(totals?.exerciseCalories ?? 0)}</td></tr>
            <tr><th scope="row">Daily average</th><td>{amount(averages?.caloriesPerDay ?? 0)}</td><td>{amount(averages?.exerciseMinutesPerDay ?? 0)}</td><td>{amount(Math.round((totals?.exerciseCalories ?? 0) / days.length * 100) / 100)}</td></tr></tfoot>
        </table>
      </div>
    </>}
  </section>;
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

function NutritionFields({ item }: { item: Food | Entry }) {
  return <div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="0.01" required defaultValue={item.calories} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.01" required defaultValue={item.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.01" required defaultValue={item.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.01" required defaultValue={item.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.01" required defaultValue={item.fiber} /></label></div>;
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

function EditDiaryEntry({ entry, profile, onClose, onSaved }: { entry: Entry; profile: Profile; onClose: () => void; onSaved: (entry: Entry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/entries", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify({ ...body, id: entry.id }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to update diary entry"); setBusy(false); return; }
    onSaved(result.entry);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Diary entry</p><h2>Edit food</h2></div><button onClick={onClose}>×</button></div><form className="food-form" onSubmit={submit}><label>Meal<select name="meal" defaultValue={entry.meal}>{meals.map(meal => <option key={meal}>{meal}</option>)}</select></label><label>Food name<input name="name" required defaultValue={entry.name} /></label><label>Serving eaten<input name="serving" required defaultValue={entry.serving} /></label><NutritionFields item={entry} />{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Update diary entry"}</button></form></div></div>;
}

function ProfileChooser({ onSelect }: { onSelect: (profile: Profile) => void }) {
  return <main className="profile-screen"><div className="profile-panel"><div className="brand-mark large">N</div><p className="eyebrow">Daily Food Tracker</p><h1>Who is tracking?</h1><p>Your food, goals, water, exercise, and custom foods stay in your own profile.</p><div className="profile-options"><button onClick={() => onSelect("chris")}><span>C</span><strong>Chris</strong></button><button onClick={() => onSelect("sarah")}><span>S</span><strong>Sarah</strong></button></div></div></main>;
}

function Macro({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  return <div className="macro"><div className="macro-label"><span>{label}</span><b>{value}g</b></div><div className="progress"><i className={color} style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div><small>{Math.max(0, round(goal - value))}g left</small></div>;
}

/** Type-ahead picker over the profile's own saved foods. USDA search stays separate. */
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

type Method = "saved" | "describe" | "scan" | "search" | "manual";
const methods: { id: Method; label: string; hint: string }[] = [
  { id: "saved", label: "Saved", hint: "Pick something you have logged before." },
  { id: "describe", label: "Describe", hint: "Type or dictate the meal and let the assistant estimate it." },
  { id: "scan", label: "Scan", hint: "Scan a packaged product barcode." },
  { id: "search", label: "Search", hint: "Look the food up in the USDA database." },
  { id: "manual", label: "Manual", hint: "Type the nutrition in yourself." },
];
const sourceSummaries: Record<Source, string> = {
  manual: "Entered by hand",
  saved: "From your saved foods",
  usda: "From USDA search",
  barcode: "From the product barcode",
  ai: "AI estimate — check it before saving",
};

function AddFood({ meal, mealLocked, date, profile, onClose, onSaved }: { meal: Meal; mealLocked: boolean; date: string; profile: Profile; onClose: () => void; onSaved: (entry: Entry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [mealChoice, setMealChoice] = useState<Meal>(meal);
  const [method, setMethod] = useState<Method>("saved");
  const [query, setQuery] = useState(""); const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Food[]>([]); const [myFoods, setMyFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [source, setSource] = useState<Source>("manual");
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
  useEffect(() => { fetch("/api/custom-foods", { headers }).then(response => response.json()).then(data => setMyFoods(data.foods ?? [])).catch(() => undefined); }, [profile]);

  /** Clears whatever produced the previous prefill so only one source is ever shown. */
  function resetSources() { setScanned(null); setBarcodeNotice(""); setDuplicate(null); setEstimate(null); setAiNotice(""); }

  function pick(food: Draft | null, origin: Source) {
    setSelected(food); setSource(origin);
    setSavedId(origin === "saved" && food?.id !== undefined ? food.id : null);
    setSelectionKey(current => current + 1);
    setBarcode(food?.barcode ? barcodeDigits(food.barcode) : "");
    resetSources();
  }

  async function searchFoods() { if (query.trim().length < 2) return; setSearching(true); setError(""); const response = await fetch(`/api/foods?q=${encodeURIComponent(query)}`); const data = await response.json(); if (response.ok) setResults(data.foods ?? []); else setError(data.error ?? "Food search is unavailable"); setSearching(false); }

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
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/entries", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...body, eatenOn: date, barcode: barcode || undefined, saveCustom: form.get("saveCustom") === "on" }) });
    const result = await response.json(); if (!response.ok) { setError(result.error ?? "Unable to save food"); setBusy(false); return; } onSaved(result.entry);
  }

  const missingLabels = (scanned?.missing ?? []).map(field => nutritionLabels[field] ?? field);
  const activeMethod = methods.find(item => item.id === method) ?? methods[0];

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-title">
    <div className="modal-head"><div><p className="eyebrow">{mealLocked ? mealChoice : "New entry"}</p><h2 id="add-title">Add food</h2></div><button onClick={onClose} aria-label="Close">×</button></div>

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
            <p className="product-credit">{scanned.attribution}</p>
          </div>}
        </>}

        {method === "search" && <>
          <div className="food-search"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void searchFoods(); } }} placeholder="Search USDA foods…" aria-label="Search USDA foods" /><button type="button" onClick={() => void searchFoods()} disabled={searching}>{searching ? "…" : "Search"}</button></div>
          {results.length > 0 && <div className="search-results">{results.map(food => <button key={food.id} type="button" onClick={() => { pick(food, "usda"); setResults([]); }}><strong>{food.name}</strong><span>{food.serving} · {Math.round(food.calories)} cal · {round(food.carbs - food.fiber)}g net</span></button>)}</div>}
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
        {savedId === null && <label className="checkbox-row"><input name="saveCustom" type="checkbox" defaultChecked={source !== "ai"} /><span>{source === "ai" ? "Save to My Foods" : "Save this to My Foods"}</span></label>}
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

function SettingsEditor({ goals, profile, onClose, onSaved }: { goals: Goals; profile: Profile; onClose: () => void; onSaved: (goals: Goals) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const next: Goals = {
      calories: Number(form.get("calories")), protein: Number(form.get("protein")), fat: Number(form.get("fat")),
      netCarbs: Number(form.get("netCarbs")), fiber: Number(form.get("fiber")), waterOunces: Number(form.get("waterOunces")),
      waterShortcutOne: Number(form.get("waterShortcutOne")), waterShortcutTwo: Number(form.get("waterShortcutTwo")), waterShortcutThree: Number(form.get("waterShortcutThree")),
    };
    if ([next.waterShortcutOne, next.waterShortcutTwo, next.waterShortcutThree].some(value => !validShortcut(value))) {
      setError(`Water shortcuts must be positive numbers up to ${MAX_WATER_OUNCES} with no more than two decimal places.`);
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
      <div className="form-grid"><label>Calories<input name="calories" type="number" min="1" defaultValue={goals.calories} /></label><label>Net carbs (g)<input name="netCarbs" type="number" min="1" defaultValue={goals.netCarbs} /></label><label>Protein (g)<input name="protein" type="number" min="1" defaultValue={goals.protein} /></label><label>Fat (g)<input name="fat" type="number" min="1" defaultValue={goals.fat} /></label><label>Fiber (g)<input name="fiber" type="number" min="1" defaultValue={goals.fiber} /></label><label>Water (oz)<input name="waterOunces" type="number" min="1" defaultValue={goals.waterOunces} /></label></div>
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

function AddExercise({ date, profile, onClose, onSaved }: { date: string; profile: Profile; onClose: () => void; onSaved: (entry: ExerciseEntry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/exercise", {
      method: "POST", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" },
      body: JSON.stringify({ exercisedOn: date, activity: form.get("activity"), minutes: Number(form.get("minutes")), calories: Number(form.get("calories") || 0) }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to add exercise"); setBusy(false); return; }
    onSaved(result.entry);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Movement</p><h2>Add exercise</h2></div><button onClick={onClose}>×</button></div><form className="food-form" onSubmit={submit}><label>Activity<input name="activity" placeholder="e.g. Walking" maxLength={100} required autoFocus /></label><div className="form-grid"><label>Minutes<input name="minutes" type="number" min="1" max="1440" step="1" required /></label><label>Calories burned (optional)<input name="calories" type="number" min="0" max="10000" step="1" /></label></div>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Add exercise"}</button></form></div></div>;
}
