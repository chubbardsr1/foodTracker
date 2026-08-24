"use client";

import { useState } from "react";
import { type Profile, addDays, addMonths, localDate, mediumDate } from "./shared";
import {
  type ExportSection, copyText, exportFileName, fetchExport, isEmptyExport,
  saveBlob, sectionLabels,
} from "./export-shared";

type Props = {
  profile: Profile;
  /** Small caps line above the title. */
  eyebrow: string;
  title: string;
  help: string;
  /** Which sections this screen offers. Every one of them starts checked. */
  sections: ExportSection[];
  /** Oldest date this screen knows about, which turns on the "All recorded" preset. */
  earliest?: string | null;
};

type Job = "" | "pdf" | "json" | "copy";

/**
 * The export centre, shared by the Weight, Journal, and Reports screens.
 *
 * Each screen decides which sections it offers; the range picker, validation,
 * PDF, and JSON all live here so there is only one implementation to keep
 * right. Dates are plain local calendar dates throughout and are handed to the
 * API as text, so nothing shifts a day when it crosses UTC midnight.
 */
export default function ExportPanel({ profile, eyebrow, title, help, sections, earliest }: Props) {
  const today = localDate();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(addDays(today, -29));
  const [end, setEnd] = useState(today);
  const [chosen, setChosen] = useState<ExportSection[]>(sections);
  const [busy, setBusy] = useState<Job>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rangeInvalid = start > end;
  const nothingChosen = chosen.length === 0;
  const blocked = rangeInvalid || nothingChosen || busy !== "";

  function toggle(section: ExportSection) {
    setNotice(""); setError("");
    setChosen(current => current.includes(section)
      ? current.filter(item => item !== section)
      : sections.filter(item => current.includes(item) || item === section));
  }

  function applyRange(from: string, to: string) {
    setNotice(""); setError("");
    setStart(from); setEnd(to);
  }

  async function run(job: Exclude<Job, "">) {
    setBusy(job); setError(""); setNotice("");
    try {
      const data = await fetchExport(profile, start, end, chosen);
      if (isEmptyExport(data)) {
        setNotice(`Nothing was recorded between ${mediumDate(start)} and ${mediumDate(end)} in the sections you chose.`);
        return;
      }
      if (job === "pdf") {
        // Loaded on demand so the PDF library never reaches a phone that is
        // only browsing the diary.
        const { buildExportPdf } = await import("./export-pdf");
        const name = exportFileName(profile, start, end, "pdf");
        saveBlob(await buildExportPdf(data), name);
        setNotice(`Saved ${name}`);
        return;
      }
      const json = JSON.stringify(data, null, 2);
      if (job === "json") {
        const name = exportFileName(profile, start, end, "json");
        saveBlob(new Blob([json], { type: "application/json" }), name);
        setNotice(`Saved ${name}`);
        return;
      }
      setNotice(await copyText(json) ? "JSON copied to the clipboard." : "Copying was blocked by this browser.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to build that export");
    } finally {
      setBusy("");
    }
  }

  return <section className="export-panel">
    <button type="button" className="export-toggle" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span className="export-toggle-copy"><p className="eyebrow">{eyebrow}</p><strong>{title}</strong></span>
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>

    {open && <div className="export-body">
      <p className="page-help">{help}</p>

      <div className="export-range">
        <label>Start<input type="date" value={start} onChange={event => applyRange(event.target.value, end)} /></label>
        <label>End<input type="date" value={end} onChange={event => applyRange(start, event.target.value)} /></label>
      </div>
      <div className="export-presets">
        <button type="button" onClick={() => applyRange(addDays(today, -6), today)}>7 days</button>
        <button type="button" onClick={() => applyRange(addDays(today, -29), today)}>30 days</button>
        <button type="button" onClick={() => applyRange(addMonths(today, -3), today)}>3 months</button>
        <button type="button" onClick={() => applyRange(addMonths(today, -6), today)}>6 months</button>
        <button type="button" onClick={() => applyRange(`${today.slice(0, 4)}-01-01`, today)}>This year</button>
        {earliest && <button type="button" onClick={() => applyRange(earliest, today)}>All recorded</button>}
      </div>

      <fieldset className="export-sections">
        <legend>Sections to include</legend>
        {sections.map(section => <label key={section}>
          <input type="checkbox" checked={chosen.includes(section)} onChange={() => toggle(section)} />
          <span>{sectionLabels[section]}</span>
        </label>)}
        {sections.length > 1 && <div className="export-section-bulk">
          <button type="button" onClick={() => { setChosen(sections); setNotice(""); setError(""); }}>Select all</button>
          <button type="button" onClick={() => { setChosen([]); setNotice(""); }}>Clear all</button>
        </div>}
      </fieldset>

      {rangeInvalid && <p className="form-error">The start date must not be after the end date.</p>}
      {nothingChosen && !rangeInvalid && <p className="form-error">Choose at least one section to export.</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="export-actions">
        <button type="button" className="primary" disabled={blocked} onClick={() => void run("pdf")}>{busy === "pdf" ? "Building PDF…" : "Download PDF"}</button>
        <button type="button" className="secondary" disabled={blocked} onClick={() => void run("json")}>{busy === "json" ? "Building JSON…" : "Download JSON"}</button>
        <button type="button" className="secondary" disabled={blocked} onClick={() => void run("copy")}>{busy === "copy" ? "Copying…" : "Copy JSON"}</button>
      </div>
      <p className="export-filename">Files are named {exportFileName(profile, start, end, "pdf")}</p>
      {notice && <p className="export-notice" aria-live="polite">{notice}</p>}
    </div>}
  </section>;
}
