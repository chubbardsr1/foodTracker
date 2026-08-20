"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Meal = "Breakfast" | "Lunch" | "Dinner" | "Snacks";
type Entry = { id: number; eatenOn: string; meal: Meal; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number };
type Goals = { calories: number; protein: number; fat: number; netCarbs: number };

const meals: Meal[] = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const defaultGoals: Goals = { calories: 1600, protein: 110, fat: 105, netCarbs: 25 };
function localDate(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function round(value: number) { return Math.round(value * 10) / 10; }

export default function FoodTracker() {
  const [date, setDate] = useState(localDate());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [loading, setLoading] = useState(true);
  const [modalMeal, setModalMeal] = useState<Meal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDay(day: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/entries?date=${day}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load entries");
      setEntries(data.entries ?? []); setGoals(data.goals ?? defaultGoals);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load this day"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadDay(date); }, [date]);

  const totals = useMemo(() => entries.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein: sum.protein + item.protein, fat: sum.fat + item.fat, carbs: sum.carbs + item.carbs, fiber: sum.fiber + item.fiber, netCarbs: sum.netCarbs + Math.max(0, item.carbs - item.fiber) }), { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, netCarbs: 0 }), [entries]);
  function shiftDate(days: number) { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); setDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`); }
  async function removeEntry(id: number) { const response = await fetch(`/api/entries?id=${id}`, { method: "DELETE" }); if (response.ok) setEntries(current => current.filter(item => item.id !== id)); }

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark">N</div><div><p className="eyebrow">Daily Food Tracker</p><h1>Nourish</h1></div><button className="icon-button" onClick={() => setGoalOpen(true)} aria-label="Edit daily goals">⚙</button></header>
    <section className="date-nav" aria-label="Choose tracking date"><button onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button><button className="date-button" onClick={() => setDate(localDate())}><strong>{date === localDate() ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span></button><button onClick={() => shiftDate(1)} aria-label="Next day">›</button></section>
    <section className="summary-card"><div className="calorie-ring" style={{ "--progress": `${Math.min(100, totals.calories / goals.calories * 100)}%` } as React.CSSProperties}><div><strong>{Math.round(totals.calories)}</strong><span>of {goals.calories}</span></div></div><div className="summary-copy"><span>CALORIES</span><strong>{Math.max(0, Math.round(goals.calories - totals.calories))} remaining</strong><small>{totals.calories > goals.calories ? `${Math.round(totals.calories - goals.calories)} over goal` : "You’re on track"}</small></div></section>
    <section className="macro-grid"><Macro label="Net carbs" value={round(totals.netCarbs)} goal={goals.netCarbs} color="purple" /><Macro label="Protein" value={round(totals.protein)} goal={goals.protein} color="coral" /><Macro label="Fat" value={round(totals.fat)} goal={goals.fat} color="gold" /></section>
    {message && <button className="notice" onClick={() => setMessage("")}>{message} ×</button>}
    <section className="meals-section"><div className="section-heading"><div><p className="eyebrow">Your day</p><h2>Meals</h2></div><span>{entries.length} {entries.length === 1 ? "item" : "items"}</span></div>
      {loading ? <div className="empty-state">Loading your day…</div> : meals.map(meal => { const items = entries.filter(entry => entry.meal === meal); const calories = items.reduce((sum, item) => sum + item.calories, 0); return <article className="meal-card" key={meal}><div className="meal-title"><div className={`meal-icon ${meal.toLowerCase()}`}>{meal === "Breakfast" ? "☀" : meal === "Lunch" ? "◐" : meal === "Dinner" ? "☾" : "✦"}</div><div><h3>{meal}</h3><span>{Math.round(calories)} calories</span></div><button onClick={() => setModalMeal(meal)} aria-label={`Add food to ${meal}`}>+</button></div>{items.length === 0 ? <button className="empty-meal" onClick={() => setModalMeal(meal)}>Add your first food</button> : items.map(item => <div className="food-row" key={item.id}><div><strong>{item.name}</strong><span>{item.serving} · {round(item.carbs - item.fiber)}g net carbs</span></div><b>{Math.round(item.calories)}</b><button onClick={() => void removeEntry(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}</article>; })}
    </section>
    <button className="floating-add" onClick={() => setModalMeal("Breakfast")}><span>＋</span> Add food</button>
    {modalMeal && <AddFood meal={modalMeal} date={date} onClose={() => setModalMeal(null)} onSaved={(entry) => { setEntries(current => [...current, entry]); setModalMeal(null); }} />}
    {goalOpen && <GoalEditor goals={goals} onClose={() => setGoalOpen(false)} onSaved={(next) => { setGoals(next); setGoalOpen(false); }} />}
  </main>;
}

function Macro({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) { const pct = Math.min(100, value / goal * 100); return <div className="macro"><div className="macro-label"><span>{label}</span><b>{value}g</b></div><div className="progress"><i className={color} style={{ width: `${pct}%` }} /></div><small>{Math.max(0, round(goal - value))}g left</small></div>; }

function AddFood({ meal, date, onClose, onSaved }: { meal: Meal; date: string; onClose: () => void; onSaved: (entry: Entry) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Array<{ id: number; name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number }>>([]);
  const [selected, setSelected] = useState<{ name: string; serving: string; calories: number; protein: number; fat: number; carbs: number; fiber: number } | null>(null);
  async function searchFoods() { if (query.trim().length < 2) return; setSearching(true); setError(""); const response = await fetch(`/api/foods?q=${encodeURIComponent(query)}`); const data = await response.json(); if (response.ok) setResults(data.foods ?? []); else setError(data.error ?? "Food search is unavailable"); setSearching(false); }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); const body = Object.fromEntries(data.entries()); const response = await fetch("/api/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, eatenOn: date }) }); const result = await response.json(); if (!response.ok) { setError(result.error ?? "Unable to save food"); setBusy(false); return; } onSaved(result.entry); }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-title"><div className="modal-head"><div><p className="eyebrow">{meal}</p><h2 id="add-title">Add food</h2></div><button onClick={onClose}>×</button></div>
    <div className="food-search"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void searchFoods(); } }} placeholder="Search USDA foods…" autoFocus /><button type="button" onClick={() => void searchFoods()} disabled={searching}>{searching ? "…" : "Search"}</button></div>
    {results.length > 0 && !selected && <div className="search-results">{results.map(food => <button key={food.id} type="button" onClick={() => { setSelected(food); setResults([]); }}><strong>{food.name}</strong><span>{food.serving} · {Math.round(food.calories)} cal · {round(food.carbs - food.fiber)}g net</span></button>)}</div>}
    <div className="coming-soon"><span>✦</span><div><strong>{selected ? "Nutrition found" : "Search or enter it yourself"}</strong><p>{selected ? "Review the serving and nutrition before saving." : "USDA search is available; package-label values can still be entered manually."}</p></div></div>
    <form key={selected?.name ?? "manual"} onSubmit={submit} className="food-form"><input type="hidden" name="meal" value={meal} /><label>Food name<input name="name" placeholder="e.g. Scrambled eggs" required defaultValue={selected?.name ?? ""} /></label><label>Serving<input name="serving" placeholder="e.g. 2 large eggs" required defaultValue={selected?.serving ?? ""} /></label><div className="form-grid"><label>Calories<input name="calories" type="number" min="0" step="1" required defaultValue={selected ? Math.round(selected.calories) : undefined} /></label><label>Protein (g)<input name="protein" type="number" min="0" step="0.1" required defaultValue={selected?.protein} /></label><label>Fat (g)<input name="fat" type="number" min="0" step="0.1" required defaultValue={selected?.fat} /></label><label>Total carbs (g)<input name="carbs" type="number" min="0" step="0.1" required defaultValue={selected?.carbs} /></label><label>Fiber (g)<input name="fiber" type="number" min="0" step="0.1" defaultValue={selected?.fiber ?? 0} required /></label></div>{error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Saving…" : "Add to diary"}</button></form></div></div>;
}

function GoalEditor({ goals, onClose, onSaved }: { goals: Goals; onClose: () => void; onSaved: (goals: Goals) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const next = { calories: Number(form.get("calories")), protein: Number(form.get("protein")), fat: Number(form.get("fat")), netCarbs: Number(form.get("netCarbs")) }; const response = await fetch("/api/goals", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }); if (response.ok) onSaved(next); else setBusy(false); }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal compact" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-head"><div><p className="eyebrow">Personalize</p><h2>Daily goals</h2></div><button onClick={onClose}>×</button></div><form onSubmit={submit} className="food-form"><div className="form-grid"><label>Calories<input name="calories" type="number" min="1" defaultValue={goals.calories} /></label><label>Net carbs (g)<input name="netCarbs" type="number" min="1" defaultValue={goals.netCarbs} /></label><label>Protein (g)<input name="protein" type="number" min="1" defaultValue={goals.protein} /></label><label>Fat (g)<input name="fat" type="number" min="1" defaultValue={goals.fat} /></label></div><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save goals"}</button></form></div></div>;
}
