/**
 * The Energy Balance PDF, built in the browser like the other exports.
 *
 * It prints the same table the Reports tab shows. The figures come from
 * `/api/reports` and the labels, wording, and number formatting from
 * `energy-balance.ts`, so the screen and this document cannot disagree.
 *
 * jsPDF is imported on demand, so a phone that never asks for this PDF never
 * downloads the library. Nothing is generated on the Worker.
 */
import type { jsPDF } from "jspdf"
import {
  ENERGY_ASSUMPTIONS,
  ENERGY_COMPARISON_NOTE,
  ENERGY_DEFINITIONS,
  type EnergyDay,
  type EnergySummary,
  energyComparison,
  energyCoverageNote,
  energyDayCells,
  energyHeaders,
  energySummaryCells,
  energyWeightNote,
} from "./energy-balance"
import { mediumDate, shortDate, weekdayLabel } from "./shared"

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BOTTOM = PAGE_HEIGHT - 32

const INK: [number, number, number] = [37, 51, 45]
const MUTED: [number, number, number] = [116, 128, 120]
const RULE: [number, number, number] = [214, 220, 214]
const HEADER_FILL: [number, number, number] = [237, 242, 237]
const CARD_FILL: [number, number, number] = [248, 250, 247]

/** One wide label column, then eight equal figure columns, filling the page width. */
const DAY_WIDTH = 92
const FIGURE_WIDTH = (CONTENT_WIDTH - DAY_WIDTH) / 8

/** The core PDF fonts cover Latin-1 only, so typographic punctuation is folded down. */
function pdfSafe(value: string) {
  return String(value ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/×/g, "x")
    .replace(/[^\n\r\t\x20-\x7E¡-ÿ]/g, "")
}

export async function buildEnergyPdf(input: {
  name: string
  start: string
  end: string
  days: EnergyDay[]
  energy: EnergySummary | null
}): Promise<Blob> {
  const { name, start, end, days, energy } = input
  const { jsPDF: JsPdf } = await import("jspdf")
  const doc = new JsPdf({ unit: "pt", format: "letter", compress: true }) as jsPDF
  let y = MARGIN

  function font(
    size: number,
    style: "normal" | "bold" | "italic" = "normal",
    colour: [number, number, number] = INK,
  ) {
    doc.setFont("helvetica", style)
    doc.setFontSize(size)
    doc.setTextColor(colour[0], colour[1], colour[2])
  }

  function paragraph(value: string, size = 8.5) {
    font(size, "normal", MUTED)
    for (const line of doc.splitTextToSize(pdfSafe(value), CONTENT_WIDTH) as string[]) {
      if (y + size + 3 > BOTTOM) {
        doc.addPage()
        y = MARGIN
        font(size, "normal", MUTED)
      }
      doc.text(line, MARGIN, y)
      y += size + 3
    }
    y += 3
  }

  function headerRow() {
    doc.setFillColor(HEADER_FILL[0], HEADER_FILL[1], HEADER_FILL[2])
    doc.rect(MARGIN, y, CONTENT_WIDTH, 16, "F")
    font(7, "bold", MUTED)
    energyHeaders.forEach((header, index) => {
      if (index === 0) doc.text(header.toUpperCase(), MARGIN + 6, y + 10.5)
      else
        doc.text(
          pdfSafe(header).toUpperCase(),
          MARGIN + DAY_WIDTH + index * FIGURE_WIDTH - 5,
          y + 10.5,
          { align: "right" },
        )
    })
    y += 16
  }

  function figures(cells: string[], bold: boolean, size: number, rowY: number, baseline: number) {
    font(size, bold ? "bold" : "normal", INK)
    cells.forEach((cell, index) => {
      doc.text(
        pdfSafe(cell),
        MARGIN + DAY_WIDTH + (index + 1) * FIGURE_WIDTH - 5,
        rowY + baseline,
        { align: "right" },
      )
    })
  }

  // ---- Title and range ---------------------------------------------------
  font(18, "bold")
  doc.text("Calorie Energy Balance", MARGIN, y + 8)
  y += 25
  font(11, "bold")
  doc.text(pdfSafe(name), MARGIN, y)
  y += 13
  font(8.5, "normal", MUTED)
  doc.text(
    pdfSafe(
      `${mediumDate(start)} through ${mediumDate(end)}  -  ${days.length} calendar ${days.length === 1 ? "day" : "days"}` +
        `  -  generated ${new Date().toLocaleString()}`,
    ),
    MARGIN,
    y,
  )
  y += 14
  paragraph(ENERGY_DEFINITIONS)

  if (energy && !energy.bodyMetricsSet)
    paragraph("Age, height, or gender is not set, so TDEE is unavailable. Set them in Settings.", 8.5)

  // ---- The table, one row per day ---------------------------------------
  headerRow()
  const rowHeight = 20
  let zebra = false
  for (const day of days) {
    if (y + rowHeight > BOTTOM) {
      doc.addPage()
      y = MARGIN
      headerRow()
      zebra = false
    }
    if (zebra) {
      doc.setFillColor(CARD_FILL[0], CARD_FILL[1], CARD_FILL[2])
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F")
    }
    zebra = !zebra
    const empty = day.items === 0 && day.sessions === 0 && day.steps === null
    font(8, "bold", empty ? MUTED : INK)
    doc.text(pdfSafe(`${weekdayLabel(day.date)} ${shortDate(day.date)}`), MARGIN + 6, y + 9)
    const weight = energyWeightNote(day)
    if (weight) {
      font(6.5, "normal", MUTED)
      doc.text(pdfSafe(weight), MARGIN + 6, y + 17)
    }
    const cells = energyDayCells(day)
    figures(cells.slice(0, -1), false, 8, y, 9)
    // The estimated deficit/overage is the figure the table builds to.
    font(8, "bold", INK)
    doc.text(pdfSafe(cells[cells.length - 1]), MARGIN + CONTENT_WIDTH - 5, y + 9, { align: "right" })
    y += rowHeight
  }

  // ---- Average and total rows -------------------------------------------
  const summaryRows: [string, string[]][] = [
    ["Daily average", energySummaryCells(energy?.averages)],
    ["Total", energySummaryCells(energy?.totals)],
  ]
  if (y + 14 * summaryRows.length + 6 > BOTTOM) {
    doc.addPage()
    y = MARGIN
    headerRow()
  }
  doc.setDrawColor(RULE[0], RULE[1], RULE[2])
  doc.setLineWidth(1)
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y)
  for (const [label, cells] of summaryRows) {
    font(8, "bold", INK)
    doc.text(label, MARGIN + 6, y + 10)
    figures(cells, true, 8, y, 10)
    y += 14
  }
  y += 8

  // ---- Weight change against the estimated deficit ----------------------
  const comparison = energyComparison(energy)
  const GAP = 8
  const CARD_WIDTH = (CONTENT_WIDTH - GAP * (comparison.length - 1)) / comparison.length
  const CARD_HEIGHT = 44
  if (y + CARD_HEIGHT + 6 > BOTTOM) {
    doc.addPage()
    y = MARGIN
  }
  doc.setDrawColor(RULE[0], RULE[1], RULE[2])
  doc.setLineWidth(0.75)
  comparison.forEach((item, index) => {
    const left = MARGIN + index * (CARD_WIDTH + GAP)
    doc.setFillColor(CARD_FILL[0], CARD_FILL[1], CARD_FILL[2])
    doc.roundedRect(left, y, CARD_WIDTH, CARD_HEIGHT, 4, 4, "FD")
    font(6.5, "bold", MUTED)
    doc.text(pdfSafe(item.label).toUpperCase(), left + 8, y + 11)
    font(13, "bold", INK)
    doc.text(pdfSafe(item.value), left + 8, y + 26)
    font(6.5, "normal", MUTED)
    doc.text(pdfSafe(item.detail), left + 8, y + 37, { maxWidth: CARD_WIDTH - 16 })
  })
  y += CARD_HEIGHT + 8

  paragraph(`${energyCoverageNote(days.length, energy)} ${ENERGY_COMPARISON_NOTE} ${ENERGY_ASSUMPTIONS} A date under a day is the weigh-in being used.`)

  // ---- Page numbers ------------------------------------------------------
  const pages = doc.getNumberOfPages()
  const footerLeft = pdfSafe(`${name} - energy balance - ${start} to ${end}`)
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    font(7.5, "normal", MUTED)
    doc.text(footerLeft, MARGIN, PAGE_HEIGHT - 22)
    doc.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 22, { align: "right" })
  }

  return doc.output("blob")
}
