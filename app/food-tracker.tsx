"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Profile = "chris" | "sarah";
type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
type Entry = { id: number; eatenOn: string; meal: Meal; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type WaterEntry = { id: number; drankOn: string; ounces: number };
type Food = { id: number; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type Goals = { calories: number; protein: number; fat: number; netCarbs: number; waterOunces: number };

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const defaultGoals: Goals = { calories: 1600, protein: 110, fat: 105, netCarbs: 25, waterOunces: 64 };
const profileNames: Record<Profile, string> = { chris: "Chris", sarah: "Sarah" };
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function round(value: number) { return Math.round(value * 10) / 10; }

export default function FoodTracker() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [loading, setLoading] = useState(true);
  const [modalMeal, setModalMeal] = useState<Meal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [customWaterOpen, setCustomWaterOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("foodTrackerProfile");
    if (saved === "chris" || saved === "sarah") setProfile(saved);
    else setLoading(false);
  }, []);

  const headers = useMemo(() => profile ? { "x-food-tracker-profile": profile } : {}, [profile]);

  async function loadDay(day: string) {
    if (!profile) return;
    setLoading(true);
    try {
      const [foodResponse, waterResponse] = await Promise.all([
        fetch(`/api/entries?date=${day}`, { headers }),
        fetch(`/api/water?date=${day}`, { headers }),
      ]);
      const foodData = await foodResponse.json();
      const waterData = await waterResponse.json();
      if (!foodResponse.ok) throw new Error(foodData.error ?? "Unable to load entries");
      if (!waterResponse.ok) throw new Error(waterData.error ?? "Unable to load water");
      setEntries(foodData.entries ?? []);
      setWater(waterData.entries ?? []);
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

  function selectProfile(next: Profile) {
    window.localStorage.setItem("foodTrackerProfile", next);
    setEntries([]); setWater([]); setGoals(defaultGoals); setProfile(next);
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

  if (!profile) return <ProfileChooser onSelect={selectProfile} />;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-mark">N</div>
      <div><p className="eyebrow">Daily Food Tracker</p><h1>Nourish</h1></div>
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
          {items.length === 0 ? <button className="empty-meal" onClick={() => setModalMeal(meal)}>Add your first food</button> : items.map(item => <div className="food-row" key={item.id}><div><strong>{item.name}</strong><span>{item.serving} · {round(item.carbs - item.fiber)}g net carbs</span></div><b>{Math.round(item.calories)}</b><button onClick={() => void removeEntry(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}
        </article>;
      })}
    </section>
    <button className="floating-add" onClick={() => setModalMeal("Breakfast")}><span>＋</span> Add food</button>
    {modalMeal && <AddFood meal={modalMeal} date={date} profile={profile} onClose={() => setModalMeal(null)} onSaved={(entry) => { setEntries(current => [...current, entry]); setModalMeal(null); }} />}
    {goalOpen && <GoalEditor goals={goals} profile={profile} onClose={() => setGoalOpen(false)} onSaved={(next) => { setGoals(next); setGoalOpen(false); }} />}
    {customWaterOpen && <CustomWater onClose={() => setCustomWaterOpen(false)} onAdd={(ounces) => { void addWater(ounces); setCustomWaterOpen(false); }} />}
  </main>;
}

function ProfileChooser({ onSelect }: { onSelect: (profile: Profile) => void }) {
  return <main className="profile-screen"><div className="profile-panel"><div className="brand-mark large">N</div><p className="eyebrow">Daily Food Tracker</p><h1>Who is tracking?</h1><p>Your food, goals, water, and custom foods stay in your own profile.</p><div className="profile-options"><button onClick={() => onSelect("chris")}><span>C</span><strong>Chris</strong></button><button onClick={() => onSelect("sarah")}><span>S</span><strong>Sarah</strong></button></div></div></main>;
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
      <label>Serving<input name="serving" placeholder="e.g. 2 large eggs" required defaultValue={selected?.serving ?? ""} /></label>
      <div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="1" required defaultValue={selected ? Math.round(selected.calories) : undefined} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.1" required defaultValue={selected?.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.1" required defaultValue={selected?.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.1" required defaultValue={selected?.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.1" defaultValue={selected?.fiber ?? 0} required /></label></div>
      {!selected && <label className="checkbox-row"><input name="saveCustom" type="checkbox" defaultChecked /><span>Save this to My Foods</span></label>}
      {error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Add to diary"}</button>
    </form>
  </div></div>;
}

function GoalEditor({ goals, profile, onClose, onSaved }: { goals: Goals; profile: Profile; onClose: () => void; onSaved: (goals: Goals) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const next = { calories: Number(form.get("calories")), protein: Number(form.get("protein")), fat: Number(form.get("fat")), netCarbs: Number(form.get("netCarbs")), waterOunces: Number(form.get("waterOunces")) };
    const response = await fetch("/api/goals", { method: "PUT", headers: { "x-food-tracker-profile": profile, "content-type": "application/json" }, body: JSON.stringify(next) });
    if (response.ok) onSaved(next); else setBusy(false);
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Personalize</p><h2>Daily goals</h2></div><button onClick={onClose}>×</button></div><form onSubmit={submit} className="food-form"><div className="form-grid"><label>Calories<input name="calories" type="number" min="1" defaultValue={goals.calories} /></label><label>Net carbs (g)<input name="netCarbs" type="number" min="1" defaultValue={goals.netCarbs} /></label><label>Protein (g)<input name="protein" type="number" min="1" defaultValue={goals.protein} /></label><label>Fat (g)<input name="fat" type="number" min="1" defaultValue={goals.fat} /></label><label>Water (oz)<input name="waterOunces" type="number" min="1" defaultValue={goals.waterOunces} /></label></div><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save goals"}</button></form></div></div>;
}

function CustomWater({ onClose, onAdd }: { onClose: () => void; onAdd: (ounces: number) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const ounces = Number(new FormData(event.currentTarget).get("ounces")); if (ounces > 0) onAdd(ounces); }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={event => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Hydration</p><h2>Add water</h2></div><button onClick={onClose}>×</button></div><form className="food-form" onSubmit={submit}><label>Number of ounces<input name="ounces" type="number" min="1" max="256" step="1" required autoFocus /></label><button className="primary">Add water</button></form></div></div>;
}
