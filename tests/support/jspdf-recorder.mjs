/**
 * jsPDF with every drawing call recorded, so a test can inspect a rendered
 * page instead of taking the layout on trust.
 *
 * jsPDF puts its methods on each instance rather than on a prototype, so the
 * only way to see the calls is to wrap the constructor. The resolver hook in
 * `tests/ts-resolver.mjs` points the PDF modules' `import("jspdf")` here; the
 * real library is loaded straight from its dist path, which the hook leaves
 * alone.
 */
import { jsPDF as Real } from "jspdf/dist/jspdf.node.min.js";

/** Text drawn since the last `startRecording()`, newest last. */
let drawn = [];
let currentPage = 1;

export function startRecording() {
  drawn = [];
  currentPage = 1;
  return () => drawn;
}

export function jsPDF(...args) {
  const doc = new Real(...args);
  const { text, addPage, setPage } = doc;

  doc.text = function record(value, x, y, options) {
    const string = Array.isArray(value) ? value.join(" ") : String(value);
    drawn.push({
      page: currentPage, x, y, text: string,
      align: options?.align ?? "left",
      width: doc.getTextWidth(string),
    });
    return text.call(this, value, x, y, options);
  };
  doc.addPage = function record(...rest) {
    const result = addPage.apply(this, rest);
    currentPage = doc.getNumberOfPages();
    return result;
  };
  doc.setPage = function record(number) {
    currentPage = number;
    return setPage.call(this, number);
  };
  return doc;
}
