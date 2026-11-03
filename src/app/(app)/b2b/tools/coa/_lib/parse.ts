/**
 * COA reader without AI: rebuilds a supplier COA's header fields and spec
 * table from the position of each piece of text on the page. The same input
 * comes from a PDF's text layer (pdf.js) or from OCR (Tesseract) on a scan.
 * Pure functions (no DOM), unit-tested in parse.test.ts.
 */

/** A piece of text on a page: x/y = top-left, in page units, y grows downwards. `conf` is set only by OCR. */
export type TextItem = { str: string; x: number; y: number; w?: number; h?: number; page: number; conf?: number };
/** A horizontal ruled line (from image.ts); ya/yb are y at x0 / x1 when the rule is sloped. */
export type HRule = { y: number; x0: number; x1: number; ya?: number; yb?: number; page?: number };
export type Rules = { h?: HRule[]; v?: Array<{ x: number; y0: number; y1: number }> };

type Item = TextItem & { w: number; h: number };
type Chunk = { text: string; x0: number; x1: number };
export type Line = { page: number; y: number; h: number; chunks: Chunk[] };

export type ParsedCOA = {
  tradeName: string;
  batchNo: string;
  mfgDate: string;
  expDate: string;
  extraFields: Array<{ label: string; value: string }>;
  columns: string[];
  groupHeader: string | null;
  rows: string[][];
  remarks: string;
};

/* ---------- lines and chunks ---------- */

/** Groups items into lines (same page, overlapping height), then merges close items into chunks (cells). */
export function toLines(items: TextItem[]): Line[] {
  // OCR noise: table borders / paper edges read as "|", "—", "~"; very unsure 1–2 letter bits.
  const ocr = (i: TextItem) => i.conf !== undefined;
  const its: Item[] = items
    .filter(
      (i) =>
        i &&
        String(i.str || "").trim() &&
        !(ocr(i) && (/^[^A-Za-z0-9:%°µ]+$/.test(String(i.str).trim()) || ((i.conf ?? 100) < 35 && String(i.str).trim().length <= 2))),
    )
    .map((i) => ({ ...i, str: String(i.str), h: i.h || 10, w: i.w || String(i.str).length * (i.h || 10) * 0.5 }));
  its.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines: Array<{ page: number; mid: number; h: number; items: Item[] }> = [];
  for (const it of its) {
    const mid = it.y + it.h / 2;
    const ln = lines.find((l) => l.page === it.page && Math.abs(l.mid - mid) < Math.max(3, Math.min(l.h, it.h) * 0.55));
    if (ln) {
      ln.items.push(it);
      ln.mid = (ln.mid * (ln.items.length - 1) + mid) / ln.items.length;
      ln.h = Math.max(ln.h, it.h);
    } else lines.push({ page: it.page, mid, h: it.h, items: [it] });
  }
  lines.sort((a, b) => a.page - b.page || a.mid - b.mid);
  return lines
    .map((l) => {
      const xs = l.items.sort((a, b) => a.x - b.x);
      const chunks: Chunk[] = [];
      for (const it of xs) {
        const last = chunks[chunks.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        // A gap wider than ~1.2 characters starts a new chunk (a new cell).
        if (last && gap < l.h * 0.6) {
          last.text += (gap > l.h * 0.12 ? " " : "") + it.str;
          last.x1 = Math.max(last.x1, it.x + it.w);
        } else chunks.push({ text: it.str, x0: it.x, x1: it.x + it.w });
      }
      chunks.forEach((c) => {
        c.text = c.text.replace(/\s+/g, " ").trim();
      });
      return { page: l.page, y: l.mid, h: l.h, chunks: chunks.filter((c) => c.text) };
    })
    .filter((l) => l.chunks.length);
}

/* ---------- text clean-up ---------- */

const ELEMENTS = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U".split(" "),
);
const SUB: Record<string, string> = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };

/** H2O → H₂O, H2SO4 → H₂SO₄, Ca(OH)2 → Ca(OH)₂: only when every part is a real element and it has 2+ of them. */
function subscriptFormula(tok: string): string {
  if (!/\d/.test(tok) || !/^[A-Z(]/.test(tok) || tok.length > 14) return tok;
  const parts = tok.match(/\(|\)\d*|[A-Z][a-z]?\d*/g);
  if (!parts || parts.join("") !== tok) return tok;
  const els = parts.filter((p) => /^[A-Z]/.test(p));
  if (els.length < 2 || !els.every((p) => ELEMENTS.has(p.replace(/\d+$/, "")))) return tok;
  return tok.replace(/(?<=[A-Za-z)])\d+/g, (d) => [...d].map((x) => SUB[x]).join(""));
}

/** Degree signs ("25 oC", "20 C" → "25°C") and chemical subscripts. */
export function fixText(s: unknown): string {
  let t = String(s ?? "").replace(/\s+/g, " ").trim();
  t = t
    .replace(/(\d)\s*(?:º|˚|°|o)\s*C\b/g, "$1°C")
    .replace(/(\d)\s+C\b(?![a-z])/g, "$1°C")
    .replace(/°\s+C\b/g, "°C");
  return t
    .split(/(\s+|[,;/]+)/)
    .map((w) => (/^[\s,;/]+$/.test(w) ? w : w.replace(/^([(\[]?)(.*?)([)\],.:;]?)$/, (_m, a: string, b: string, c: string) => a + subscriptFormula(b) + c)))
    .join("");
}

/* ---------- header fields ---------- */

type FieldKey = "tradeName" | "batchNo" | "mfgDate" | "expDate";
const F: Record<FieldKey, RegExp> = {
  tradeName:
    /^(product(\s*name)?|name\s*of\s*(the\s*)?(product|material)|trade\s*name|material(\s*name)?|item(\s*name)?|product\s*description|chemical\s*name|commodity)$/i,
  batchNo: /^(batch|lot)(\s*\/\s*lot)?\s*(no\.?|number|#)?$/i,
  mfgDate: /^(mfg\.?|mfd\.?|manuf\.?|manufactur\w*|production|date\s*of\s*(mfg\.?|manufactur\w*|production))(\s*date)?$/i,
  expDate: /^(exp\.?|expiry|expiration|retest|re-test|best\s*before|use\s*before|date\s*of\s*(expiry|exp\.?|retest|re-test))(\s*date)?$/i,
};
// Letterhead / contact lines that look like "label: value" but aren't COA fields.
const JUNK =
  /^(tel|telephone|ph|phone|mob|mobile|fax|e-?mail|email\s*id|web|website|www|gst|gstin|cin|pan|regd|registered|address|plot|works|factory|office|head\s*office|pin|page)\b/i;
const keyOf = (label: string): FieldKey | null =>
  (Object.keys(F) as FieldKey[]).find((k) => F[k].test(label.replace(/[:.\s]+$/, "").trim())) || null;

/** "Label : value" pairs in one line (several per line when the header block has two columns). */
function pairsIn(line: Line): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const cs = line.chunks;
  for (let i = 0; i < cs.length; i++) {
    const t = cs[i].text;
    const m = t.match(/^([^:]{2,40}?)\s*[:：]\s*(.*)$/);
    if (m) {
      let value = m[2];
      // "Label :" with the value in the next chunk
      if (!value && cs[i + 1] && !/[:：]/.test(cs[i + 1].text)) {
        value = cs[i + 1].text;
        i++;
      }
      // "Batch No. : X   Mfg. Date : Y" merged into one chunk
      const more = value.match(/^(.*?)\s{1,}((?:[A-Z][A-Za-z./ ]{1,30}?))\s*[:：]\s*(.+)$/);
      if (more && keyOf(more[2])) {
        out.push([m[1], more[1]]);
        out.push([more[2], more[3]]);
        continue;
      }
      out.push([m[1], value]);
    } else if (cs[i + 1] && /^[:：]/.test(cs[i + 1].text) && t.length <= 40) {
      // "Quantity"  ": 2800 Kg"
      out.push([t, cs[i + 1].text]);
      i++;
    } else if (keyOf(t) && cs[i + 1]) {
      // "Batch No."  "AB12345" with no colon
      out.push([t, cs[i + 1].text]);
      i++;
    }
  }
  return out
    .map(([l, v]): [string, string] => [
      l.replace(/\s+/g, " ").trim(),
      String(v || "")
        .replace(/^\s*[:：;]+\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    ])
    .filter(([l, v]) => l && v && !JUNK.test(l));
}

/* ---------- spec table ---------- */

const HEAD_WORD =
  /^(s\.?\s*no\.?|sr\.?\s*no\.?|sl\.?\s*no\.?|no\.?|tests?|test\s*(parameter|name)s?|parameters?|characteristics?|properties|specifications?|specs?|limits?|requirements?|standard|results?|test\s*results?|observations?|observed|method|test\s*method|units?|values?|analysis|description|norms?|typical|actual|minimum|maximum|min\.?|max\.?|nominal|complies)$/i;
const SUBHEAD = /^(min\.?|max\.?|minimum|maximum|nominal|typical|lower|upper|from|to)$/i;
const STOP =
  /^(conclusion|remarks?|comments?|opinion|result\s*:|the\s*above\s*(batch|lot|sample|product|material)|this\s*(is|report|certificate)|complies\s*with|approved|checked|prepared|tested|analy[sz]ed|reviewed|released|authori[sz]ed|signature|q\.?\s*c\.?\s*(head|manager|in-?charge)|quality\s*(control|assurance)|for\s*(and\s*on\s*behalf|[A-Z])|note\s*:|date\s*of\s*(mfg|manufactur|expiry|exp|retest))/i;
const isHeaderLine = (l: Line) => l.chunks.length >= 2 && l.chunks.filter((c) => HEAD_WORD.test(c.text.replace(/[:.]$/, "").trim())).length >= 2;
const center = (c: Chunk) => (c.x0 + c.x1) / 2;

function columnsFrom(head: Line, sub: Line | undefined, above: Line | undefined): { cols: Chunk[]; group: string | null; used: number } {
  // Two header rows: "Requirements" spanning "Min | Max" → columns = left headers + sub-headers + right headers.
  if (sub && sub.chunks.length >= 2 && sub.chunks.every((c) => SUBHEAD.test(c.text.replace(/[:.]$/, "").trim()))) {
    const s0 = Math.min(...sub.chunks.map((c) => c.x0)),
      s1 = Math.max(...sub.chunks.map((c) => c.x1));
    // The spanning label is on the header line, or on its own line just above it (rowspan headers sit lower).
    const near = above && head.y - above.y < head.h * 2.5 ? above.chunks : [];
    const spans = [...head.chunks, ...near].filter((c) => center(c) >= s0 - 4 && center(c) <= s1 + 4);
    const left = head.chunks.filter((c) => center(c) < s0 - 4),
      right = head.chunks.filter((c) => center(c) > s1 + 4);
    const cols = [...left, ...sub.chunks, ...right].sort((a, b) => a.x0 - b.x0);
    return { cols, group: spans.map((c) => c.text).join(" ") || null, used: 2 };
  }
  return { cols: head.chunks.slice().sort((a, b) => a.x0 - b.x0), group: null, used: 1 };
}

function tableFrom(lines: Line[], start: number, rules?: Rules) {
  const first = columnsFrom(lines[start], lines[start + 1], lines[start - 1]);
  const group = first.group;
  let used = first.used;
  const cols = first.cols.map((c) => ({ ...c }));
  const headWordish = (t: string) =>
    !/\d/.test(t) &&
    t.split(/\s+/).length <= 3 &&
    (HEAD_WORD.test(t.replace(/[:.]$/, "").trim()) || /^(no\.?|obtain\w*|obtan\w*|observed|value|limit|\(.*\)|%.*|[A-Z][A-Z .()%/-]+)$/.test(t.trim()));
  // Headings written on two lines ("Sr." / "No.", "RESULT" / "OBTAINED") join up.
  for (let k2 = 0; k2 < 2; k2++) {
    const hl = lines[start + used];
    if (!(hl && hl.y - lines[start + used - 1].y < lines[start].h * 2.5 && hl.chunks.every((c) => headWordish(c.text)))) break;
    hl.chunks.forEach((c) => {
      const k = cols.reduce((b, col, j) => (Math.abs(center(col) - center(c)) < Math.abs(center(cols[b]) - center(c)) ? j : b), 0);
      cols[k].text += " " + c.text;
      cols[k].x0 = Math.min(cols[k].x0, c.x0);
      cols[k].x1 = Math.max(cols[k].x1, c.x1);
    });
    used++;
  }
  const centers = cols.map(center);
  // Anything well left / right of the table (paper edges, stamps) is ignored.
  const h0 = lines[start].h,
    left = cols[0].x0 - h0 * 2.5,
    right = cols[cols.length - 1].x1 + h0 * 3;
  // Column edges halfway between header centres; a cell goes to the column its centre falls in.
  const edges = centers.slice(0, -1).map((c, i) => (c + centers[i + 1]) / 2);
  const colOf = (chunk: Chunk) => {
    const x = center(chunk);
    let i = 0;
    while (i < edges.length && x >= edges[i]) i++;
    return i;
  };
  const serial = /^(s|sr|sl)?\.?\s*no\.?$/i.test(cols[0].text.trim());
  const rows: string[][] = [];
  let end = start + used,
    lastY = lines[start + used - 1].y,
    pending: string[] | null = null;
  const lh = Math.max(4, lines[start].h);
  // Ruled lines (scans): a horizontal rule across a good part of the table between two text
  // lines is a row boundary. When the table has them, they decide the rows.
  const tx0 = cols[0].x0,
    tx1 = cols[cols.length - 1].x1,
    tw = Math.max(1, tx1 - tx0);
  // A sloped rule (curved photo) is read at the middle of the table.
  const mid = (tx0 + tx1) / 2;
  const yMid = (r: HRule) =>
    r.ya === undefined || r.yb === undefined || r.x1 === r.x0 ? r.y : r.ya + ((r.yb - r.ya) * (mid - r.x0)) / (r.x1 - r.x0);
  const hr = (rules?.h || [])
    .filter((r) => r.page === undefined || r.page === lines[start].page)
    .filter((r) => Math.min(r.x1, tx1 + lh * 3) - Math.max(r.x0, tx0 - lh * 3) >= tw * 0.25)
    .map(yMid)
    .sort((a, b) => a - b);
  const ruleBetween = (y0: number, y1: number) => hr.some((y) => y > y0 + 2 && y < y1 - 2);
  const ruled = hr.filter((y) => y > lines[start].y).length >= 2;
  const inTable = (c: Chunk) => c.x1 > left && c.x0 < right;
  const filled = (ln: Line | undefined) => {
    const t = ln?.chunks.filter(inTable).find((c) => colOf(c) === 0)?.text || "";
    return serial ? /^\d+[.,)]?$/.test(t.replace(/\s/g, "")) : !!t;
  };
  const mergeInto = (prev: string[], cells: string[]) =>
    cells.forEach((v, k) => {
      if (v) prev[k] = prev[k] ? prev[k] + " " + v : v;
    });
  for (let i = start + used; i < lines.length; i++) {
    const l = lines[i];
    const text = l.chunks.map((c) => c.text).join(" ");
    if (STOP.test(text) || (l.page !== lines[start].page && !rows.length)) break;
    if (rows.length && l.chunks.length >= 3 && l.chunks.every((c) => HEAD_WORD.test(c.text.replace(/[:.]$/, "").trim()))) break;
    // A big vertical gap after the table ends it.
    if (ruled ? l.y > hr[hr.length - 1] + Math.min(lh, l.h) * 0.6 : rows.length && l.y - lines[i - 1].y > lines[i - 1].h * 4) break;
    const cells: string[] = Array(cols.length).fill("");
    l.chunks.filter(inTable).forEach((c) => {
      const k = colOf(c);
      cells[k] = cells[k] ? cells[k] + " " + c.text : c.text;
    });
    if (!cells.some(Boolean)) continue;
    if (ruled) {
      // Rows from the ruled lines: a rule above this line starts a new row, otherwise it continues the row.
      if (!rows.length || ruleBetween(lastY, l.y)) rows.push(cells);
      else mergeInto(rows[rows.length - 1], cells);
      lastY = l.y;
      end = i + 1;
      continue;
    }
    // OCR often misses a serial number: a clear gap before a line with a parameter name also starts a row.
    const gapRow = serial && rows.length > 0 && l.y - lastY > lh * 2.2 && !!cells[1] && /^[A-Z[(]/.test(cells[1]);
    if (!filled(l) && !gapRow) {
      // No first-column text: a wrapped line. It belongs to the row above, or (when cells are
      // centred vertically and this line sits just above the next row's first line) to the next row.
      const next = lines[i + 1];
      const toNext = next && filled(next) && !STOP.test(next.chunks.map((c) => c.text).join(" ")) && next.y - l.y < l.y - lastY;
      if (toNext || !rows.length) pending = pending ? pending.map((v, k) => [v, cells[k]].filter(Boolean).join(" ")) : cells;
      else mergeInto(rows[rows.length - 1], cells);
    } else {
      if (pending) {
        const p = pending;
        p.forEach((v, k) => {
          if (v) cells[k] = cells[k] ? v + " " + cells[k] : v;
        });
        pending = null;
      }
      rows.push(cells);
    }
    lastY = l.y;
    end = i + 1;
  }
  // Serial numbers are renumbered 1, 2, 3… (OCR reads them badly: "1 7.", "l.").
  if (serial) rows.forEach((r, k) => {
    r[0] = String(k + 1);
  });
  return { columns: cols.map((c) => c.text.replace(/\s+/g, " ").trim()), groupHeader: group, rows, end };
}

/* ---------- whole document ---------- */

/** Supplier COA text → header fields, spec table and remarks. */
export function parseCOA(items: TextItem[], { rules }: { rules?: Rules } = {}): ParsedCOA {
  const lines = toLines(items);
  const out: ParsedCOA = { tradeName: "", batchNo: "", mfgDate: "", expDate: "", extraFields: [], columns: [], groupHeader: null, rows: [], remarks: "" };
  const take = ([label, value]: [string, string]) => {
    const k = keyOf(label);
    if (k) {
      if (!out[k]) out[k] = value;
      return;
    }
    if (!out.extraFields.some((f) => f.label.toLowerCase() === label.toLowerCase())) out.extraFields.push({ label, value });
  };
  const h = lines.findIndex(isHeaderLine);
  const before = h < 0 ? lines : lines.slice(0, h);
  before.forEach((l) => pairsIn(l).forEach(take));
  if (h >= 0) {
    const t = tableFrom(lines, h, rules);
    out.columns = t.columns;
    out.groupHeader = t.groupHeader;
    out.rows = t.rows;
    for (const l of lines.slice(t.end)) {
      const text = l.chunks.map((c) => c.text).join(" ");
      const m = text.match(/^(conclusion|remarks?|comments?|opinion)\s*[:：-]\s*(.+)$/i);
      if (m && !out.remarks) out.remarks = m[2].trim();
      // Dates / batch sometimes sit under the table: only the known fields are taken from there.
      pairsIn(l).forEach(([label, value]) => {
        const k = keyOf(label);
        if (k && !out[k]) out[k] = value;
      });
    }
  }
  // Dates keep only from the first digit ("£29.09.2028" → "29.09.2028").
  for (const k of ["mfgDate", "expDate"] as const) out[k] = String(out[k]).replace(/^[^0-9A-Za-z]+/, "").trim();
  out.tradeName = fixText(out.tradeName);
  out.columns = out.columns.map(fixText);
  out.rows = out.rows.map((r) => r.map(fixText)).filter((r) => r.some(Boolean));
  out.extraFields = out.extraFields.map((f) => ({ label: f.label, value: fixText(f.value) }));
  return out;
}

/* ---------- dates on the COA ---------- */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "01/07/2026", "2026-07-01", "07-2026", "July 2026" → "Jul-2026" (as the Atomgrid COA shows them); else unchanged. */
export function monthYear(s: unknown): string {
  const t = String(s ?? "")
    .trim()
    .replace(/[/.]/g, "-");
  let m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${MON[+m[2] - 1]}-${m[1]}`;
  m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${MON[+m[2] - 1]}-${m[3].length === 2 ? "20" + m[3] : m[3]}`;
  m = t.match(/^(\d{1,2})-(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${MON[+m[1] - 1]}-${m[2]}`;
  m = t.match(/^(\d{1,2})?[\s-]*([A-Za-z]{3,9})[\s,-]+(\d{4})$/);
  if (m) {
    const word = m[2].toLowerCase();
    const i = MON.findIndex((x) => word.startsWith(x.toLowerCase()));
    if (i >= 0) return `${MON[i]}-${m[3]}`;
  }
  return String(s ?? "").trim();
}

/** Pasted table (from Excel or a PDF: tab- or 2+-space-separated) → { columns, rows }. */
export function parsePasted(text: string): { columns: string[]; rows: string[][] } {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());
  if (!lines.length) return { columns: [], rows: [] };
  const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map((c) => fixText(c));
  const [head, ...body] = lines.map(split);
  const n = Math.max(...[head, ...body].map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(n - r.length).fill("")].slice(0, n);
  return { columns: pad(head), rows: body.map(pad) };
}
