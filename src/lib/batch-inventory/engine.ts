/**
 * Name and date helpers from the reconciliation engine of the old inventory sheet
 * (AGEngine): the product-name normalisation that treats common misspellings alike,
 * a SequenceMatcher-style similarity ratio, and the sheet date reader. Pure.
 *
 * The engine's full sheet-vs-sheet reconcile (and its embedded product catalogue)
 * is not ported: product names and aliases come from the ERP's Product master.
 */

const pad = (n: number | string) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A sheet cell → YYYY-MM-DD or null (dd/mm/yy(yy) day-first, yyyy-mm-dd, Excel serials from 2000, Dates). */
export function toDate(v: unknown, dayfirst = true): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const d = new Date(v.getTime() + 120000); // SheetJS historic-offset seconds
    if (d.getFullYear() < 2000) return null;
    return iso(d);
  }
  if (typeof v === "number") {
    if (v < 36526) return null;
    const d = new Date(Math.round((v - 25569) * 864e5));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    const dd = dayfirst ? m[1] : m[2];
    const mm = dayfirst ? m[2] : m[1];
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
    return `${y}-${pad(mm)}-${pad(dd)}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

// Common misspellings in agrochemical names (generic chemistry, no business data).
const FIXES: [string, string][] = [
  ["PROFENOPHOS", "PROFENOFOS"], ["NOVALURAN", "NOVALURON"], ["DINOTEFURON", "DINOTEFURAN"], ["TEMBOTRION ", "TEMBOTRIONE "],
  ["CHLORANTRANILIRPOLE", "CHLORANTRANILIPROLE"], ["CHLORANTRANILLIPROLE", "CHLORANTRANILIPROLE"], ["CHLORANTRANIPROLE", "CHLORANTRANILIPROLE"],
  ["CHLORATRANILIPROLE", "CHLORANTRANILIPROLE"], ["CHIORANTRANILIPROLE", "CHLORANTRANILIPROLE"], ["MANOOZEB", "MANCOZEB"], ["POTASSIM", "POTASSIUM"],
  ["PYMTROZINE", "PYMETROZINE"], ["PENOSULAM", "PENOXSULAM"], ["DIFENOCONAZOLE", "DIFENCONAZOLE"], ["PYROXASULFONE", "PYRAXASULFONE"],
  ["LAMDA", "LAMBDA"], ["LAMBDACYHALOTHRIN", "LAMBDA CYHALOTHRIN"], ["TRICYCALAZOLE", "TRICYCLAZOLE"], ["ALPHA CYPERMETHRIN", "ALPHACYPERMETHRIN"],
  ["QUIZALOFOP-ETHYAL", "QUIZALOFOP"], ["QUIZALOFOP ETHYL", "QUIZALOFOP"], ["QUIZALOFOP P-ETHYL", "QUIZALOFOP"], ["QUIZALOFOP P ETHYL", "QUIZALOFOP"],
  ["FENOXAPROP-P-ETHYL", "FENOXAPROP"], ["EMAMECTIN BENZOATE 5 SG", "EMAMECTIN BENZOATE 5% SG"], ["BISPYRIBAC SODIUM 10 SC", "BISPYRIBAC SODIUM 10% SC"],
  ["PRECIPIATED SILICA", "PPT SILICA"], ["ISOXADIFEN-ETHYL 98%", "ISOXADIFEN-ETHYL SAFENER"], ["N-PHENYLPYRAZOLE1", "N-PHENYLPYRAZOLE-1"],
];

/** Normalised product name: upper case, pack sizes and common suffixes dropped, misspellings fixed, A–Z 0–9 % . + only. */
export function norm(s0: unknown): string {
  let s = String(s0 ?? "").toUpperCase().replace(/\n/g, " ");
  s = s.replace(/\b\d+\s*X\s*\d+\s*(LTR?|LT|KG)\.?/g, "");
  s = s.replace(/-\s*\d+\s*(LTR?|KG)\b/g, "");
  s = s.replace(/\b25\s*-?\s*KG\b/g, "");
  s = s.replace(/\((RMSFG[^)]*|HERBICIDE|BPS|SAFNER|MILLING PROCESS|GRANULES|96%|38040010)\)/g, "");
  s = s.replace(/-\s*BAGS\s*25\s*KG/g, "");
  s = s.split("TECHNUICAL").join("TECHNICAL").split("TECH.").join("TECHNICAL");
  s = s.replace(/\bTECH\b/g, "TECHNICAL");
  s = s.replace(/(\d)\.(\d)0%/g, "$1.$2%");
  s = s.replace(/\s+@\s+/g, " ");
  for (const [a, b] of FIXES) s = s.split(a).join(b);
  s = s.replace(/\b(TECHNICAL)\s+\d+(\.\d+)?%.*$/, "$1");
  s = s.replace(/\b(TECHNICAL)\s+\d+%\s*W\/W MIN/, "$1");
  s = s.replace(/BENZOATE\s*0\.9/g, "0.9");
  s = s.split("EMAMECTIN BENZOATE 0.9").join("EMAMECTIN 0.9");
  return s.replace(/[^A-Z0-9%.+]/g, "");
}

/** difflib.SequenceMatcher(None, a, b).ratio() without junk heuristics: 2·matches / (|a| + |b|). */
export function ratio(a: string, b: string): number {
  const m = (alo: number, ahi: number, blo: number, bhi: number): number => {
    let bi = alo;
    let bj = blo;
    let bk = 0;
    let j2len: Record<number, number> = {};
    for (let i = alo; i < ahi; i++) {
      const nj: Record<number, number> = {};
      for (let j = blo; j < bhi; j++)
        if (a[i] === b[j]) {
          const k = (j2len[j - 1] || 0) + 1;
          nj[j] = k;
          if (k > bk) {
            bi = i - k + 1;
            bj = j - k + 1;
            bk = k;
          }
        }
      j2len = nj;
    }
    if (!bk) return 0;
    return bk + m(alo, bi, blo, bj) + m(bi + bk, ahi, bj + bk, bhi);
  };
  const t = a.length + b.length;
  return t ? (2 * m(0, a.length, 0, b.length)) / t : 1;
}

/**
 * Closest name in a list: the same normalised spelling first, else the best ratio above
 * `threshold` (0.78, as the Domestic MIS master check uses). null when nothing is close.
 */
export function suggestName(value: string, list: readonly string[], threshold = 0.78): string | null {
  const k = norm(value);
  let best: string | null = null;
  let bs = threshold;
  for (const n of list) {
    const nk = norm(n);
    if (nk === k) return n;
    if (Math.abs(nk.length - k.length) > Math.max(nk.length, k.length) / 2) continue;
    const s = ratio(k, nk);
    if (s > bs) {
      bs = s;
      best = n;
    }
  }
  return best;
}

export const AGEngine = { toDate, norm, ratio, suggestName };
