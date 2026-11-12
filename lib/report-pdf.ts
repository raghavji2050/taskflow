import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pdfSafe } from "@/lib/report-export-rules";

export type PdfColumn = { header: string; width: number };

/** Simple paginated A4-landscape table report. Widths are fractions summing to ~1. */
export async function buildTablePdf(opts: { title: string; subtitle: string; summary: string[]; columns: PdfColumn[]; rows: string[][] }) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(opts.title));
  doc.setProducer("TaskFlow");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 36, size = 8.5, rowH = 14;
  const usable = W - M * 2;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const fit = (text: string, f: PDFFont, max: number) => {
    let t = pdfSafe(text);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", size) > max) t = t.slice(0, -1);
    return t + "...";
  };
  const header = () => {
    let x = M;
    page.drawRectangle({ x: M, y: y - 4, width: usable, height: rowH, color: rgb(0.93, 0.94, 0.98) });
    for (const c of opts.columns) {
      page.drawText(fit(c.header, bold, c.width * usable - 6), { x: x + 3, y, size, font: bold, color: rgb(0.1, 0.1, 0.12) });
      x += c.width * usable;
    }
    y -= rowH;
  };

  page.drawText(pdfSafe(opts.title), { x: M, y: y - 6, size: 16, font: bold, color: rgb(0.31, 0.35, 0.75) });
  y -= 24;
  page.drawText(pdfSafe(opts.subtitle), { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) });
  y -= 16;
  for (const line of opts.summary) {
    page.drawText(pdfSafe(line), { x: M, y, size: 10, font, color: rgb(0.1, 0.1, 0.12) });
    y -= 13;
  }
  y -= 8;
  header();
  opts.rows.forEach((r, i) => {
    if (y < M + rowH) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: usable, height: rowH, color: rgb(0.975, 0.975, 0.98) });
    let x = M;
    opts.columns.forEach((c, ci) => {
      page.drawText(fit(r[ci] ?? "", font, c.width * usable - 6), { x: x + 3, y, size, font, color: rgb(0.15, 0.15, 0.17) });
      x += c.width * usable;
    });
    y -= rowH;
  });
  if (opts.rows.length === 0) page.drawText("No rows for this selection.", { x: M + 3, y, size, font, color: rgb(0.4, 0.4, 0.45) });
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`TaskFlow - page ${i + 1} of ${pages.length}`, { x: W - M - 110, y: 18, size: 7.5, font, color: rgb(0.5, 0.5, 0.55) }));
  return doc.save();
}
