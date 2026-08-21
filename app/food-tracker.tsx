"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Profile = "chris" | "sarah";
type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
type Entry = { id: number; eatenOn: string; meal: Meal; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type WaterEntry = { id: number; drankOn: string; ounces: number };
type ExerciseEntry = { id: number; exercisedOn: string; activity: string; minutes: number; calories: number };
type Food = { id: number; name: string; serving: string; servingGrams?: number; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type Goals = { calories: number; protein: number; fat: number; netCarbs: number; fiber: number; waterOunces: number };

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const defaultGoals: Goals = { calories: 1600, protein: 110, fat: 105, netCarbs: 25, fiber: 25, waterOunces: 64 };
const profileNames: Record<Profile, string> = { chris: "Chris", sarah: "Sarah" };
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function round(value: number) { return Math.round(value * 10) / 10; }

export default function FoodTracker() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [loading, setLoading] = useState(true);
  const [modalMeal, setModalMeal] = useState<Meal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [showMyFoods, setShowMyFoods] = useState(false);
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
  function shiftDate(days: number) {
    const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days);
    setDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
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

  if (showMyFoods) return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">N</div>
      <div><p className="eyebrow">{profileNames[profile]}</p><h1>My Foods</h1></div>
      <button className="nav-button" onClick={() => setShowMyFoods(false)}>← Diary</button>
    </header>
    <MyFoodsPage profile={profile} />
  </main>;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">N</div>
      <div><p className="eyebrow">Daily Food Tracker</p><h1>Nourish</h1></div>
      <button className="nav-button" onClick={() => setShowMyFoods(true)}>My Foods</button>
      <button className="profile-button" onClick={() => { window.localStorage.removeItem("foodTrackerProfile"); setProfile(null); }} aria-label="Switch profile">
        <span>{profileNames[profile].charAt(0)}</span>{profileNames[profile]}
      </button>
      <button className="icon-button" onClick={() => setGoalOpen(true)} aria-label="Edit daily goals">⚙</button>
    </header>
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
      <div className="water-heading"><div className="water-drop">◒</div><div><p className="eyebrow">Hydration</p><h2>{round(waterTotal)} <small>of {goals.waterOunces} oz</small></h2></div></div>
      <div className="water-progress"><i style={{ width: `${Math.min(100, waterTotal / goals.waterOunces * 100)}%` }} /></div>
      <div className="water-buttons">
        {[6, 8, 12].map(ounces => <button key={ounces} onClick={() => void addWater(ounces)}>+ {ounces} oz</button>)}
        <button onClick={() => setCustomWaterOpen(true)}>+ Other</button>
      </div>
      {water.length > 0 && <div className="water-history">{water.map(item => <button key={item.id} onClick={() => void removeWater(item.id)} title="Remove this water entry">{round(item.ounces)} oz ×</button>)}</div>}
    </section>
    {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}
    <section className="meals-section"><div className="section-heading"><div><p className="eyebrow">Your day</p><h2>Meals</h2></div><span>{entries.length} {entries.length === 1 ? "item" : "items"}</span></div>
      {loading ? <div className="empty-state">Loading your day…</div> : meals.map(meal => {
        const items = entries.filter(entry => entry.meal === meal);
        const calories = items.reduce((sum, item) => sum + item.calories, 0);
        return <article className="meal-card" key={meal}>
          <div className="meal-title"><div className={`meal-icon ${meal.toLowerCase()}`}>{meal === "Breakfast" ? "☀" : meal === "Lunch" ? "◐" : meal === "Dinner" ? "☾" : "✦"}</div><div><h3>{meal}</h3><span>{Math.round(calories)} calories</span></div><button onClick={() => setModalMeal(meal)} aria-label={`Add food to ${meal}`}>+</button></div>
          {items.length === 0 ? <button className="empty-meal" onClick={() => setModalMeal(meal)}>Add your first food</button> : items.map(item => <div className="food-row" key={item.id}><div><strong>{item.name}</strong><span>{item.serving} · {round(item.carbs - item.fiber)}g net carbs</span></div><b>{round(item.calories)}</b><button onClick={() => setEditingEntry(item)} aria-label={`Edit ${item.name}`}>✎</button><button onClick={() => void removeEntry(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}
        </article>;
      })}
    </section>
    <button className="floating-add" onClick={() => setModalMeal("Breakfast")}><span>＋</span> Add food</button>
    {modalMeal && <AddFood meal={modalMeal} date={date} profile={profile} onClose={() => setModalMeal(null)} onSaved={(entry) => { setEntries(current => [...current, entry]); setModalMeal(null); }} />}
    {goalOpen && <GoalEditor goals={goals} profile={profile} onClose={() => setGoalOpen(false)} onSaved={(next) => { setGoals(next); setGoalOpen(false); }} />}
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

function AddFood({ meal, date, profile, onClose, onSaved }: { meal: Meal; date: string; profile: Profile; onClose: () => void; onSaved: (entry: Entry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Food[]>([]); const [myFoods, setMyFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const headers = { "x-food-tracker-profile": profile };
  useEffect(() => { fetch("/api/custom-foods", { headers }).then(response => response.json()).then(data => setMyFoods(data.foods ?? [])).catch(() => undefined); }, [profile]);
  async function searchFoods() { if (query.trim().length < 2) return; setSearching(true); setError(""); const response = await fetch(`/api/foods?q=${encodeURIComponent(query)}`); const data = await response.json(); if (response.ok) setResults(data.foods ?? []); else setError(data.error ?? "Food search is unavailable"); setSearching(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const response = await fetch("/api/entries", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...body, eatenOn: date, saveCustom: form.get("saveCustom") === "on" }) });
    const result = await response.json(); if (!response.ok) { setError(result.error ?? "Unable to save food"); setBusy(false); return; } onSaved(result.entry);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-title">
    <div className="modal-head"><div><p className="eyebrow">{meal}</p><h2 id="add-title">Add food</h2></div><button onClick={onClose}>×</button></div>
    {myFoods.length > 0 && !selected && <><p className="field-heading">My saved foods</p><div className="saved-foods">{myFoods.map(food => <button key={food.id} onClick={() => setSelected(food)}><strong>{food.name}</strong><span>{food.serving}</span></button>)}</div></>}
    <div className="food-search"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void searchFoods(); } }} placeholder="Search USDA foods…" autoFocus /><button type="button" onClick={() => void searchFoods()} disabled={searching}>{searching ? "…" : "Search"}</button></div>
    {results.length > 0 && !selected && <div className="search-results">{results.map(food => <button key={food.id} type="button" onClick={() => { setSelected(food); setResults([]); }}><strong>{food.name}</strong><span>{food.serving} · {Math.round(food.calories)} cal · {round(food.carbs - food.fiber)}g net</span></button>)}</div>}
    <div className="coming-soon"><span>✦</span><div><strong>{selected ? "Nutrition selected" : "Search or enter it yourself"}</strong><p>{selected ? "Review the serving and nutrition before saving." : "Foods entered manually can be saved to My Foods for next time."}</p></div></div>
    <form key={selected?.id ?? "manual"} onSubmit={submit} className="food-form"><input type="hidden" name="meal" value={meal} />
      <label>Food name<input name="name" placeholder="e.g. Scrambled eggs" required defaultValue={selected?.name ?? ""} /></label>
      <label>Serving<input name="serving" placeholder="e.g. 4 oz or 1/2 cup" required defaultValue={selected?.serving ?? ""} /></label>
      <label>Servings eaten<input name="servings" type="number" min="0.01" max="100" step="0.01" required defaultValue="1.00" /><small>Use 0.50 for half a serving. Nutrition is adjusted automatically.</small></label>
      <div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="0.01" required defaultValue={selected?.calories} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.01" required defaultValue={selected?.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.01" required defaultValue={selected?.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.01" required defaultValue={selected?.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.01" defaultValue={selected?.fiber ?? 0} required /></label></div>
      {!selected && <label className="checkbox-row"><input name="saveCustom" type="checkbox" defaultChecked /><span>Save this to My Foods</span></label>}
      {error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Add to diary"}</button>
    </form>
  </div></div>;
}

function GoalEditor({ goals, profile, onClose, onSaved }: { goals: Goals; profile: Profile; onClose: () => void; onSaved: (goals: Goals) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const next = { calories: Number(form.get("calories")), protein: Number(form.get("protein")), fat: Number(form.get("fat")), netCarbs: Number(form.get("netCarbs")), fiber: Number(form.get("fiber")), waterOunces: Number(form.get("waterOunces")) };
    const response = await fetch("/api/goals", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify(next) });
    if (response.ok) onSaved(next); else setBusy(false);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Personalize</p><h2>Daily goals</h2></div><button onClick={onClose}>×</button></div><form onSubmit={submit} className="food-form"><div className="form-grid"><label>Calories<input name="calories" type="number" min="1" defaultValue={goals.calories} /></label><label>Net carbs (g)<input name="netCarbs" type="number" min="1" defaultValue={goals.netCarbs} /></label><label>Protein (g)<input name="protein" type="number" min="1" defaultValue={goals.protein} /></label><label>Fat (g)<input name="fat" type="number" min="1" defaultValue={goals.fat} /></label><label>Fiber (g)<input name="fiber" type="number" min="1" defaultValue={goals.fiber} /></label><label>Water (oz)<input name="waterOunces" type="number" min="1" defaultValue={goals.waterOunces} /></label></div><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save goals"}</button></form></div></div>;
}

function CustomWater({ onClose, onAdd }: { onClose: () => void; onAdd: (ounces: number) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const ounces = Number(new FormData(event.currentTarget).get("ounces")); if (ounces > 0) onAdd(ounces); }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Hydration</p><h2>Add water</h2></div><button onClick={onClose}>×</button></div><form className="food-form" onSubmit={submit}><label>Number of ounces<input name="ounces" type="number" min="1" max="256" step="1" required autoFocus /></label><button className="primary">Add water</button></form></div></div>;
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
