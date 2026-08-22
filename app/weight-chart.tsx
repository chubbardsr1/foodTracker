"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, amount, localDate, longDate, mediumDate, shortDate } from "./shared";

export type WeightPoint = { weighedOn: string; pounds: number };

/** The ranges offered above the chart. `months` of null means every reading. */
const ranges = [
  { id: "1m", label: "1 month", months: 1 },
  { id: "3m", label: "3 months", months: 3 },
  { id: "6m", label: "6 months", months: 6 },
  { id: "all", label: "All", months: null },
] as const;
type RangeId = typeof ranges[number]["id"];

const PADDING = { top: 16, right: 14, bottom: 26, left: 44 };
const HEIGHT = 200;

/** Calendar days since the epoch, read at local midday so no reading shifts a day. */
function dayNumber(date: string) {
  return Math.round(new Date(`${date}T12:00:00`).getTime() / 86400000);
}

/**
 * Weight history drawn as a plain SVG line chart.
 *
 * Points are placed by their real date, so a gap between weigh-ins shows as a
 * gap rather than an evenly spaced run. Nothing is interpolated or filled in
 * for days without a reading. The SVG is drawn at the measured width of its
 * container so the labels stay the same size on a phone and on a laptop.
 */
export default function WeightChart({ entries }: { entries: WeightPoint[] }) {
  const [range, setRange] = useState<RangeId>("3m");
  const [width, setWidth] = useState(320);
  const frame = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(240, Math.round(node.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sorted = useMemo(() => [...entries].sort((a, b) => a.weighedOn.localeCompare(b.weighedOn)), [entries]);
  const active = ranges.find(item => item.id === range) ?? ranges[1];
  const from = active.months === null ? null : addMonths(localDate(), -active.months);
  const shown = useMemo(() => from === null ? sorted : sorted.filter(entry => entry.weighedOn >= from), [sorted, from]);

  const first = shown[0] ?? null;
  const last = shown[shown.length - 1] ?? null;
  const change = first && last ? Math.round((last.pounds - first.pounds) * 100) / 100 : null;

  const plot = useMemo(() => {
    if (shown.length === 0) return null;
    const innerWidth = Math.max(40, width - PADDING.left - PADDING.right);
    const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const days = shown.map(entry => dayNumber(entry.weighedOn));
    const pounds = shown.map(entry => entry.pounds);
    const firstDay = days[0]; const lastDay = days[days.length - 1];
    const span = lastDay - firstDay;
    let low = Math.min(...pounds); let high = Math.max(...pounds);
    // A flat or single reading still needs a band to sit in.
    if (high - low < 1) { const middle = (high + low) / 2; low = middle - 1; high = middle + 1; }
    else { const margin = (high - low) * 0.12; low -= margin; high += margin; }
    const x = (day: number) => span === 0 ? PADDING.left + innerWidth / 2 : PADDING.left + (day - firstDay) / span * innerWidth;
    const y = (value: number) => PADDING.top + (high - value) / (high - low) * innerHeight;
    const points = shown.map((entry, index) => ({ entry, x: x(days[index]), y: y(entry.pounds) }));
    const ticks = [high, (high + low) / 2, low];
    return { points, ticks, y, innerWidth };
  }, [shown, width]);

  const summary = first && last
    ? `Weight from ${amount(first.pounds)} pounds on ${longDate(first.weighedOn)} to ${amount(last.pounds)} pounds on ${longDate(last.weighedOn)}, `
      + (change === null || shown.length < 2 ? "a single reading." : change === 0 ? "no change." : `${change > 0 ? "up" : "down"} ${amount(Math.abs(change))} pounds.`)
    : "No weigh-ins in this range.";

  return <section className="weight-chart-card">
    <div className="weight-chart-head">
      <div><p className="eyebrow">Weight history</p><h3>{active.label}</h3></div>
      <div className="weight-range" role="group" aria-label="Chart range">
        {ranges.map(item => <button key={item.id} type="button"
          className={item.id === range ? "active" : ""}
          aria-pressed={item.id === range}
          onClick={() => setRange(item.id)}>{item.id === "all" ? "All" : item.id.toUpperCase()}</button>)}
      </div>
    </div>

    <div className="weight-chart-stats">
      <div><span>Starting</span><strong>{first ? `${amount(first.pounds)} lbs` : "—"}</strong><small>{first ? mediumDate(first.weighedOn) : "no reading"}</small></div>
      <div><span>Latest</span><strong>{last ? `${amount(last.pounds)} lbs` : "—"}</strong><small>{last ? mediumDate(last.weighedOn) : "no reading"}</small></div>
      <div><span>Change</span>
        <strong className={change === null || change === 0 ? "" : change < 0 ? "down" : "up"}>
          {change === null || shown.length < 2 ? "—" : change === 0 ? "0 lbs" : `${change > 0 ? "+" : "−"}${amount(Math.abs(change))} lbs`}
        </strong>
        <small>{shown.length < 2 ? "one reading or fewer" : `over ${shown.length} readings`}</small>
      </div>
    </div>

    <div className="weight-chart-frame" ref={frame}>
      {plot === null
        ? <p className="weight-chart-empty">{sorted.length === 0
            ? "No weights logged yet. Add your first one below."
            : `No weigh-ins in the last ${active.label}. Choose All to see everything recorded.`}</p>
        : <svg className="weight-chart-svg" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={summary}>
            {plot.ticks.map((value, index) => {
              const lineY = plot.y(value);
              return <g key={index}>
                <line x1={PADDING.left} x2={width - PADDING.right} y1={lineY} y2={lineY} className="weight-grid" />
                <text x={PADDING.left - 8} y={lineY + 3.5} textAnchor="end" className="weight-axis">{amount(Math.round(value * 10) / 10)}</text>
              </g>;
            })}
            {plot.points.length > 1 && <polyline className="weight-line" points={plot.points.map(point => `${point.x},${point.y}`).join(" ")} />}
            {plot.points.map(point => <circle key={point.entry.weighedOn} cx={point.x} cy={point.y} r={plot.points.length > 40 ? 2 : 3.5} className="weight-point">
              <title>{`${mediumDate(point.entry.weighedOn)}: ${amount(point.entry.pounds)} lbs`}</title>
            </circle>)}
            <text x={PADDING.left} y={HEIGHT - 8} className="weight-axis">{shortDate(shown[0].weighedOn)}</text>
            {shown.length > 1 && <text x={width - PADDING.right} y={HEIGHT - 8} textAnchor="end" className="weight-axis">{shortDate(shown[shown.length - 1].weighedOn)}</text>}
          </svg>}
    </div>
    <p className="weight-chart-note">Only recorded weigh-ins are plotted. Days without a reading are left out rather than filled in.</p>
  </section>;
}
