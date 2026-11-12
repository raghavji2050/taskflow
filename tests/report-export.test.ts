import { describe, expect, it } from "vitest";
import { csvCell, exportFilename, hours, localDate, pdfSafe, toCsv } from "@/lib/report-export-rules";
import { buildTablePdf } from "@/lib/report-pdf";
import { BUILTIN_TEMPLATES, parseTemplateData, snapshotProject } from "@/lib/project-template-rules";

describe("report export rules", () => {
  it("csv escapes quotes/commas and neutralises formulas, with BOM", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    const csv = toCsv(["A", "B"], [["x", 1], ["नमस्ते", "-2"]]);
    expect(csv.startsWith("\uFEFFA,B\r\nx,1\r\n")).toBe(true);
    expect(csv).toContain("नमस्ते,'-2");
  });
  it("pdfSafe keeps latin, maps smart punctuation, replaces others", () => {
    expect(pdfSafe("Plan this week’s “goals” – done…")).toBe(`Plan this week's "goals" - done...`);
    expect(pdfSafe("नमस्ते Raghav")).toBe("? Raghav");
  });
  it("dates, hours and filenames", () => {
    expect(localDate("2026-11-11T20:00:00Z", -330)).toBe("2026-11-12");
    expect(localDate(null)).toBe("");
    expect(hours(5400)).toBe("1.50");
    expect(exportFilename("tasks", "Acme Studio!", "csv", new Date("2026-11-12T00:00:00Z"))).toBe("taskflow-tasks-acme-studio-2026-11-12.csv");
  });
  it("builds a multi-page PDF", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => [`Task ${i} – “quoted”`, "open", "high"]);
    const bytes = await buildTablePdf({ title: "T", subtitle: "s", summary: ["80 tasks"], columns: [{ header: "Title", width: 0.6 }, { header: "Status", width: 0.2 }, { header: "Priority", width: 0.2 }], rows });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });
});

describe("project templates", () => {
  it("built-ins are valid", () => {
    for (const b of BUILTIN_TEMPLATES) expect(parseTemplateData(b.data)).toEqual(b.data);
  });
  it("parse clamps and drops junk", () => {
    const d = parseTemplateData({ sections: [{ name: " A ", tasks: [{ title: "x", priority: "URGENT", dueInDays: 999.4 }, { title: "" }, null] }, { name: "" }, 5] });
    expect(d).toEqual({ sections: [{ name: "A", tasks: [{ title: "x", priority: "MEDIUM", description: undefined, dueInDays: 365 }] }] });
    expect(parseTemplateData({ sections: [] })).toBeNull();
    expect(parseTemplateData("nope")).toBeNull();
  });
  it("snapshot keeps sections, offsets due dates, puts loose tasks in the first section", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    const d = snapshotProject(
      [{ id: "s1", name: "Todo" }, { id: "s2", name: "Done" }],
      [
        { title: "a", priority: "HIGH", description: null, dueDate: new Date("2026-11-15T00:00:00Z"), sectionId: "s2" },
        { title: "b", priority: "LOW", description: "d", dueDate: null, sectionId: null },
      ],
      now
    );
    expect(d.sections.map((s) => [s.name, s.tasks.map((t) => [t.title, t.dueInDays])])).toEqual([["Todo", [["b", null]]], ["Done", [["a", 3]]]]);
  });
});
