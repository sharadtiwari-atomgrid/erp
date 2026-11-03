"use client";

/**
 * COA generator: supplier COA in, Atomgrid-format COA out. PDFs are read from
 * their text layer, scans and photos with OCR (_lib). Everything lands in an
 * editable form; the A4 preview is what prints / saves.
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fixText, monthYear, parsePasted, type ParsedCOA } from "./_lib/parse";
import { saveCoaToJob } from "./actions";

export type CoaJob = { id: string; jobNo: string; productName: string | null; customer: string | null; quantityKgs: number | null };

type Field = { id: string; label: string; value: string; show: boolean };
type Source = { file: string; page?: number | null; method: string; conf?: number };
type Coa = {
  id: string;
  source: Source;
  title: string;
  fields: Field[];
  columns: string[];
  group: string;
  rows: string[][];
  remarksOn: boolean;
  remarks: string;
  signOn: boolean;
  sign: string[];
  note: string;
  print: boolean;
};
type Footer = { company: string; address: string; phone: string; email: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const LS_FOOTER = "coa_footer_v1";
const FOOTER_EVENT = "coa-footer";
/** The company details are typed in once and kept in this browser. */
const DEFAULT_FOOTER: Footer = { company: "Atomgrid", address: "", phone: "", email: "" };
const DEFAULT_NOTE = "This report is computer generated, hence does not require any signature.";
const SERIAL = /^(s|sr|sl)?\.?\s*no\.?$/i;
const bkey = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");

/** A parsed supplier COA → the editable COA. */
function fromParsed(p: Partial<ParsedCOA>, source: Source): Coa {
  let columns = (p.columns || []).filter((c) => c !== undefined);
  let rows = (p.rows || []).map((r) => columns.map((_, i) => r[i] || ""));
  if (!columns.length) {
    columns = ["Parameter", "Specification", "Result"];
    rows = [["", "", ""]];
  }
  // The Atomgrid COA always has an S. No. column first.
  if (!SERIAL.test(String(columns[0]).trim())) {
    columns = ["S. No.", ...columns];
    rows = rows.map((r, i) => [String(i + 1), ...r]);
  } else columns = ["S. No.", ...columns.slice(1)];
  const extra = (p.extraFields || []).map((f) => ({ id: uid(), label: f.label, value: f.value, show: /^qty|quantity/i.test(f.label) }));
  return {
    id: uid(),
    source,
    title: "Certificate of Analysis",
    fields: [
      { id: uid(), label: "Trade Name", value: p.tradeName || "", show: true },
      { id: uid(), label: "Mfg. Date", value: monthYear(p.mfgDate) || "", show: true },
      { id: uid(), label: "Exp. Date", value: monthYear(p.expDate) || "", show: true },
      { id: uid(), label: "Batch No.", value: p.batchNo || "", show: true },
      ...extra,
    ],
    columns,
    group: p.groupHeader || "",
    rows,
    remarksOn: false,
    remarks: p.remarks || "",
    signOn: false,
    sign: ["Prepared By", "Approved By", "Released By"],
    note: DEFAULT_NOTE,
    print: true,
  };
}
const blankCoa = () => fromParsed({}, { file: "Typed in", method: "Manual" });
const fieldOf = (coa: Coa, re: RegExp) => coa.fields.find((f) => re.test(f.label));

function applyJob(c: Coa, j: CoaJob | null): Coa {
  if (!j) return c;
  const q = fieldOf(c, /^qty|quantity/i);
  const kg = j.quantityKgs ? `${j.quantityKgs} Kg` : "";
  if (q) {
    if (!q.value && kg) q.value = kg;
  } else if (kg) c.fields.splice(4, 0, { id: uid(), label: "Quantity", value: kg, show: true });
  return c;
}

/* ---------- footer kept in localStorage ---------- */
function subscribeFooter(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(FOOTER_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(FOOTER_EVENT, cb);
  };
}
function readFooterRaw() {
  try {
    return localStorage.getItem(LS_FOOTER) ?? "";
  } catch {
    return "";
  }
}
function parseFooter(raw: string): Footer {
  try {
    const f = JSON.parse(raw || "null");
    if (f && typeof f === "object") return { ...DEFAULT_FOOTER, ...f };
  } catch {
    // fall through
  }
  return DEFAULT_FOOTER;
}
function storeFooter(f: Footer) {
  try {
    localStorage.setItem(LS_FOOTER, JSON.stringify(f));
  } catch {
    // Storage blocked: the footer simply isn't remembered.
  }
  window.dispatchEvent(new Event(FOOTER_EVENT));
}

const link = "text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50";
const xBtn = "rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-red-50 hover:text-red-700";
const h4 = "mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft";

export function CoaTool({ jobs, canSave }: { jobs: CoaJob[]; canSave: boolean }) {
  const [coas, setCoas] = useState<Coa[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFooter, setShowFooter] = useState(false);
  const [paste, setPaste] = useState("");
  const [jobQ, setJobQ] = useState("");
  const sheetsRef = useRef<HTMLDivElement>(null);

  const footerRaw = useSyncExternalStore(subscribeFooter, readFooterRaw, () => "");
  const footer = useMemo(() => parseFooter(footerRaw), [footerRaw]);

  const job = useMemo(() => {
    const t = jobQ.trim().toLowerCase();
    if (!t) return null;
    return jobs.find((j) => j.jobNo.toLowerCase() === t || `${j.jobNo} · ${j.productName || ""} · ${j.customer || ""}`.toLowerCase() === t) || null;
  }, [jobQ, jobs]);

  const cur = coas[active];
  const patch = (fn: (c: Coa) => Coa) => setCoas((list) => list.map((c, i) => (i === active ? fn(structuredClone(c)) : c)));

  /* ---------- reading files ---------- */
  async function onFiles(fileList: FileList | null) {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    setBusy(true);
    try {
      const { readCOAFile } = await import("./_lib/extract");
      const made: Coa[] = [];
      for (const [k, f] of files.entries()) {
        const pre = files.length > 1 ? `${f.name} (${k + 1}/${files.length}): ` : `${f.name}: `;
        setStatus(pre + "reading…");
        try {
          const pages = await readCOAFile(f, (m) => setStatus(pre + m));
          for (const pg of pages) {
            const found = pg.parsed.batchNo || pg.parsed.tradeName || pg.parsed.rows.length;
            if (!found && pages.length > 1) continue; // an empty extra page
            made.push(fromParsed(pg.parsed, { file: f.name, page: pages.length > 1 ? pg.page : null, method: pg.method, conf: pg.conf }));
          }
        } catch (e) {
          setStatus(`${pre}${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // The same batch from two files is kept once.
      const seen = new Set(coas.map((c) => bkey(fieldOf(c, /batch/i)?.value)).filter(Boolean));
      const fresh = made.filter((c) => {
        const b = bkey(fieldOf(c, /batch/i)?.value);
        if (!b) return true;
        if (seen.has(b)) return false;
        seen.add(b);
        return true;
      });
      if (job) fresh.forEach((c) => applyJob(c, job));
      setActive(coas.length);
      setCoas((list) => [...list, ...fresh]);
      const scans = fresh.filter((c) => /recognition/.test(c.source.method)).length;
      setStatus(
        fresh.length
          ? `${fresh.length} COA${fresh.length > 1 ? "s" : ""} read${scans ? ` — ${scans} from a scan: check every value against the original before printing` : " — check the values before printing"}.`
          : "Nothing could be read from that file. Add the COA by hand or paste its table.",
      );
    } finally {
      setBusy(false);
    }
  }

  const addJobQuantity = () => {
    if (job) setCoas((list) => list.map((c) => applyJob(structuredClone(c), job)));
  };

  /* ---------- output ---------- */
  const printing = coas.filter((c) => c.print);
  const printNow = () => {
    if (printing.length) window.print();
  };
  async function saveToJob() {
    if (!job || !printing.length || !sheetsRef.current) return;
    setBusy(true);
    try {
      const { sheetsToPdf } = await import("./_lib/extract");
      const batches = printing.map((c) => fieldOf(c, /batch/i)?.value).filter(Boolean).join(", ");
      const name = `COA - ${job.jobNo}${batches ? " - " + batches.replace(/[\\/:*?"<>|]/g, "-") : ""}.pdf`;
      setStatus("Making the PDF…");
      const els = [...sheetsRef.current.querySelectorAll<HTMLElement>(".coa-wrap:not(.skip) .coa-sheet")];
      const blob = await sheetsToPdf(els, name);
      setStatus("Uploading to the job…");
      const fd = new FormData();
      fd.append("file", new File([blob], name, { type: "application/pdf" }));
      fd.append("fileName", name);
      const res = await saveCoaToJob(job.id, fd);
      if (!res.ok) throw new Error(res.error);
      setStatus(`Saved to job ${job.jobNo}'s COA as “${res.fileName}”.`);
    } catch (e) {
      setStatus("Not saved: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  /* ---------- editing helpers ---------- */
  const setField = <K extends "label" | "value" | "show">(id: string, k: K, v: Field[K]) =>
    patch((c) => {
      const f = c.fields.find((x) => x.id === id);
      if (f) f[k] = v;
      return c;
    });
  const setCell = (r: number, k: number, v: string) =>
    patch((c) => {
      c.rows[r][k] = v;
      return c;
    });
  const addRow = () =>
    patch((c) => {
      c.rows.push(c.columns.map((_, i) => (i === 0 ? String(c.rows.length + 1) : "")));
      return c;
    });
  const delRow = (r: number) =>
    patch((c) => {
      c.rows.splice(r, 1);
      c.rows.forEach((row, i) => {
        row[0] = String(i + 1);
      });
      return c;
    });
  const addCol = () =>
    patch((c) => {
      c.columns.push("New column");
      c.rows.forEach((row) => row.push(""));
      return c;
    });
  const delCol = (k: number) =>
    patch((c) => {
      c.columns.splice(k, 1);
      c.rows.forEach((row) => row.splice(k, 1));
      return c;
    });
  const applyPaste = () => {
    const t = parsePasted(paste);
    if (!t.columns.length) return;
    patch((c) => {
      let { columns, rows } = t;
      if (!SERIAL.test(String(columns[0]).trim())) {
        columns = ["S. No.", ...columns];
        rows = rows.map((r, i) => [String(i + 1), ...r]);
      }
      c.columns = columns;
      c.rows = rows.length ? rows : [columns.map(() => "")];
      c.group = "";
      return c;
    });
    setPaste("");
  };

  return (
    <div className="coa-tool grid items-start gap-5 xl:grid-cols-[minmax(340px,470px)_minmax(0,1fr)]">
      <div className="space-y-3 print:hidden">
        <Card className="px-4 py-3.5">
          <h3 className="mb-2 text-sm font-semibold text-ink">
            1 · Job <span className="font-normal text-ink-faint">(optional)</span>
          </h3>
          <Input list="cg-jobs" placeholder="Domestic MIS job no." value={jobQ} onChange={(e) => setJobQ(e.target.value)} aria-label="Job" />
          <datalist id="cg-jobs">
            {jobs.slice(0, 600).map((j) => (
              <option key={j.id} value={`${j.jobNo} · ${j.productName || ""} · ${j.customer || ""}`} />
            ))}
          </datalist>
          {job ? (
            <p className="mt-1.5 text-xs text-ink-soft">
              Job {job.jobNo}: {job.productName || "—"} → {job.customer || "—"} · {job.quantityKgs ?? "?"} kg
              {coas.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" className={link} onClick={addJobQuantity}>
                    add its quantity to the COAs
                  </button>
                </>
              )}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-soft">Pick a job to fill the quantity and to save the finished COA to it.</p>
          )}
        </Card>

        <Card className="px-4 py-3.5">
          <h3 className="mb-2 text-sm font-semibold text-ink">2 · Supplier COA</h3>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-line bg-muted/30 px-3 py-6 text-center hover:border-brand-500",
              busy && "cursor-progress opacity-60",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) onFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              hidden
              multiple
              accept=".pdf,image/*"
              disabled={busy}
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <b className="text-sm">{busy ? "Reading…" : "Click or drop files here"}</b>
            <span className="text-xs text-ink-soft">PDF · JPG · PNG · WEBP — several files, or one file with a page per batch</span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCoas((l) => [...l, applyJob(blankCoa(), job)]);
                setActive(coas.length);
              }}
            >
              ＋ Type one in
            </Button>
          </div>
          {status && <p className="mt-2.5 rounded-md bg-brand-50 px-2.5 py-2 text-xs text-ink">{status}</p>}
        </Card>

        {cur && (
          <Card className="px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {coas.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn("rounded-full border px-3 py-1 text-xs", i === active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface")}
                  onClick={() => setActive(i)}
                >
                  {i + 1} · {fieldOf(c, /batch/i)?.value || "no batch"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              From {cur.source.file}
              {cur.source.page ? `, page ${cur.source.page}` : ""} · {cur.source.method}
              {cur.source.conf ? ` · recognition ${cur.source.conf}% sure` : ""}
            </p>

            <h4 className={h4}>Details</h4>
            <table className="w-full">
              <tbody>
                {cur.fields.map((f) => (
                  <tr key={f.id} className={f.show ? "" : "opacity-50"}>
                    <td className="w-6 pt-2.5 align-top">
                      <input type="checkbox" checked={f.show} onChange={(e) => setField(f.id, "show", e.target.checked)} title="Show on the COA" />
                    </td>
                    <td className="p-0.5">
                      <Input className="h-8 text-xs" value={f.label} onChange={(e) => setField(f.id, "label", e.target.value)} aria-label="Field label" />
                    </td>
                    <td className="p-0.5">
                      <Input className="h-8 text-xs" value={f.value} onChange={(e) => setField(f.id, "value", e.target.value)} aria-label={f.label} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={xBtn}
                        title="Remove"
                        onClick={() =>
                          patch((c) => {
                            c.fields = c.fields.filter((x) => x.id !== f.id);
                            return c;
                          })
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className={link}
              onClick={() =>
                patch((c) => {
                  c.fields.push({ id: uid(), label: "New field", value: "", show: true });
                  return c;
                })
              }
            >
              ＋ Add field
            </button>

            <h4 className={h4}>Specification table</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr>
                    {cur.columns.map((hd, k) => (
                      <th key={k} className="p-0.5 whitespace-nowrap">
                        <div className="flex items-center">
                          <Input
                            className="h-8 text-xs font-semibold"
                            value={hd}
                            aria-label={`Column ${k + 1}`}
                            onChange={(e) =>
                              patch((c) => {
                                c.columns[k] = e.target.value;
                                return c;
                              })
                            }
                          />
                          {k > 0 && cur.columns.length > 2 && (
                            <button type="button" className={xBtn} title="Remove column" onClick={() => delCol(k)}>
                              ✕
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th>
                      <button type="button" className={link} title="Add column" onClick={addCol}>
                        ＋
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((v, k) => (
                        <td key={k} className={cn("p-0.5 align-top", k === 0 && "w-9 text-center")}>
                          {k === 0 ? (
                            <span className="inline-block pt-1.5 text-xs text-ink-soft">{v}</span>
                          ) : (
                            <Textarea
                              className="px-2 py-1 text-xs leading-snug"
                              rows={Math.min(4, Math.max(1, Math.ceil(String(v).length / 22)))}
                              value={v}
                              aria-label={cur.columns[k]}
                              onChange={(e) => setCell(r, k, e.target.value)}
                            />
                          )}
                        </td>
                      ))}
                      <td className="align-top">
                        <button type="button" className={xBtn} title="Remove row" onClick={() => delRow(r)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" className={link} onClick={addRow}>
                ＋ Add row
              </button>
              <label className="flex flex-1 items-center gap-2 text-xs">
                Heading over the middle columns
                <Input
                  className="h-8 flex-1 text-xs"
                  placeholder="e.g. Requirements"
                  value={cur.group}
                  onChange={(e) =>
                    patch((c) => {
                      c.group = e.target.value;
                      return c;
                    })
                  }
                />
              </label>
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-semibold text-brand-700">Paste the table instead (from Excel or a PDF)</summary>
              <Textarea
                className="my-1.5 font-mono text-xs"
                rows={5}
                placeholder={"Parameter\tSpecification\tResult\nPurity\tMin 98%\t98.6%"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <Button variant="secondary" size="sm" disabled={!paste.trim()} onClick={applyPaste}>
                Replace the table
              </Button>
            </details>

            <h4 className={h4}>Extras</h4>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={cur.remarksOn}
                onChange={(e) =>
                  patch((c) => {
                    c.remarksOn = e.target.checked;
                    return c;
                  })
                }
              />
              Remarks above the signatures
            </label>
            {cur.remarksOn && (
              <Textarea
                className="mt-1 text-xs"
                rows={2}
                value={cur.remarks}
                aria-label="Remarks"
                onChange={(e) =>
                  patch((c) => {
                    c.remarks = e.target.value;
                    return c;
                  })
                }
              />
            )}
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={cur.signOn}
                onChange={(e) =>
                  patch((c) => {
                    c.signOn = e.target.checked;
                    return c;
                  })
                }
              />
              Signature block
            </label>
            {cur.signOn && (
              <div className="mt-1 flex gap-2">
                {cur.sign.map((s, k) => (
                  <Input
                    key={k}
                    className="h-8 text-xs"
                    value={s}
                    aria-label={`Signature ${k + 1}`}
                    onChange={(e) =>
                      patch((c) => {
                        c.sign[k] = e.target.value;
                        return c;
                      })
                    }
                  />
                ))}
              </div>
            )}
            <label className="mt-2 flex flex-col gap-1 text-xs">
              Note at the bottom
              <Input
                className="h-8 text-xs"
                value={cur.note}
                onChange={(e) =>
                  patch((c) => {
                    c.note = e.target.value;
                    return c;
                  })
                }
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCoas((l) => [...l.slice(0, active + 1), { ...structuredClone(cur), id: uid() }, ...l.slice(active + 1)]);
                  setActive(active + 1);
                }}
              >
                Copy for another batch
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCoas((l) => l.filter((_, i) => i !== active));
                  setActive(Math.max(0, active - 1));
                }}
              >
                Remove this COA
              </Button>
            </div>
          </Card>
        )}

        <Card className="px-4 py-3.5">
          <button type="button" className={link} onClick={() => setShowFooter(!showFooter)}>
            {showFooter ? "▾" : "▸"} Footer (company, address, contact)
          </button>
          {showFooter && (
            <div className="mt-2 space-y-2">
              {(
                [
                  ["company", "Company"],
                  ["address", "Address"],
                  ["phone", "Contact no."],
                  ["email", "Email"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex flex-col gap-1 text-xs">
                  {l}
                  <Input className="h-8 text-xs" value={footer[k]} onChange={(e) => storeFooter({ ...footer, [k]: e.target.value })} />
                </label>
              ))}
              <p className="text-xs text-ink-faint">Saved in this browser.</p>
              <button type="button" className={link} onClick={() => storeFooter(DEFAULT_FOOTER)}>
                Reset the footer
              </button>
            </div>
          )}
        </Card>
      </div>

      <div className="min-w-0">
        <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs print:hidden">
          <span className="text-ink-faint">
            {coas.length ? `${printing.length} of ${coas.length} page${coas.length > 1 ? "s" : ""} selected` : "The COA will appear here"}
          </span>
          <span className="flex-1" />
          {canSave && (
            <Button variant="secondary" size="sm" disabled={!printing.length || busy || !job} title={job ? "" : "Pick a job first"} onClick={saveToJob}>
              Save PDF to job
            </Button>
          )}
          <Button size="sm" disabled={!printing.length} onClick={printNow}>
            Print / Save as PDF
          </Button>
        </div>
        <div className="coa-print-root" ref={sheetsRef}>
          {coas.map((c, i) => (
            <div key={c.id} className={cn("coa-wrap", !c.print && "skip")}>
              <label className="coa-pick">
                <input type="checkbox" checked={c.print} onChange={(e) => setCoas((l) => l.map((x, j) => (j === i ? { ...x, print: e.target.checked } : x)))} /> Page{" "}
                {i + 1}
              </label>
              <CoaSheet coa={c} footer={footer} onClick={() => setActive(i)} />
            </div>
          ))}
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

/** One A4 page in the Atomgrid format. Shrinks its text a little when a long table would spill over. */
function CoaSheet({ coa, footer, onClick }: { coa: Coa; footer: Footer; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = "";
    const max = el.parentElement ? (297 / 210) * el.offsetWidth : 1123;
    for (let fs = 100; fs >= 70 && el.scrollHeight > max + 2; fs -= 3) el.style.fontSize = fs + "%";
  });
  const cols = coa.columns,
    n = cols.length;
  const mid = n - 2;
  const grouped = Boolean(coa.group) && mid >= 2;
  const show = coa.fields.filter((f) => f.show && (f.label || f.value));
  return (
    <div className="coa-sheet" ref={ref} onClick={onClick}>
      <div className="coa-wm" aria-hidden="true" />
      <div className="coa-head">
        {/* A plain <img> so html2canvas copies it into the PDF. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/coa/atomgrid-logo.png" alt="Atomgrid" className="coa-logo" />
        <hr />
        <div className="coa-title">{coa.title}</div>
      </div>
      <table className="coa-info">
        <tbody>
          {show.map((f) => (
            <tr key={f.id}>
              <td>{f.label}</td>
              <td>{fixText(f.value) || "N/A"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="coa-spec">
        <thead>
          {grouped ? (
            <>
              <tr>
                <th rowSpan={2} className="sno">{cols[0]}</th>
                <th rowSpan={2}>{cols[1]}</th>
                <th colSpan={mid - 1}>{coa.group}</th>
                <th rowSpan={2}>{cols[n - 1]}</th>
              </tr>
              <tr>
                {cols.slice(2, n - 1).map((c, k) => (
                  <th key={k}>{c}</th>
                ))}
              </tr>
            </>
          ) : (
            <tr>
              {cols.map((c, k) => (
                <th key={k} className={k === 0 ? "sno" : ""}>{c}</th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {coa.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, k) => (
                <td key={k} className={k === n - 1 ? "res" : ""}>{fixText(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {coa.remarksOn && coa.remarks && (
        <div className="coa-remarks">
          <b>
            <u>Remarks:</u>
          </b>{" "}
          {coa.remarks}
        </div>
      )}
      {coa.signOn && (
        <table className="coa-sign">
          <tbody>
            <tr>
              {coa.sign.map((s, k) => (
                <th key={k}>{s}</th>
              ))}
            </tr>
            <tr>
              {coa.sign.map((_, k) => (
                <td key={k}>&nbsp;</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      {coa.note && <div className="coa-note">Note : {coa.note}</div>}
      <div className="coa-foot">
        <div className="fc">{footer.company}</div>
        <div className="fa">
          {footer.address && (
            <>
              <b>Corporate Office:</b> {footer.address}
              <br />
            </>
          )}
          {footer.phone && (
            <>
              <b>Contact No :</b> {footer.phone} &nbsp;{" "}
            </>
          )}
          {footer.email && (
            <>
              <b>EMAIL ID:</b> {footer.email}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .coa-print-root { display: flex; flex-direction: column; gap: 18px; align-items: center; overflow-x: auto; padding-bottom: 20px; }
  .coa-wrap { position: relative; }
  .coa-wrap.skip .coa-sheet { opacity: .45; }
  .coa-pick { display: flex; gap: 6px; align-items: center; font-size: 12px; color: #64748b; margin-bottom: 6px; }

  /* ---- The Atomgrid COA (A4) ---- */
  .coa-sheet { position: relative; width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 9mm 13mm 8mm; background: #fff; color: #1a1a2e;
    font-family: Arial, Helvetica, sans-serif; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,.11); cursor: pointer; overflow: hidden; font-size: 12.5px; }
  .coa-wm { position: absolute; inset: 0; background: url(/coa/watermark.png) no-repeat center / 85mm 85mm; opacity: .15; pointer-events: none; }
  .coa-sheet > *:not(.coa-wm) { position: relative; z-index: 1; }
  .coa-head { text-align: center; margin-bottom: 8mm; }
  .coa-logo { height: 14mm; width: auto; display: inline-block; }
  .coa-head hr { border: none; border-top: 2px solid #ddd; margin: 5mm 0; }
  .coa-title { font-size: 1.15em; font-weight: 700; text-decoration: underline; }
  .coa-info, .coa-spec, .coa-sign { width: 100%; border-collapse: collapse; border: 1px solid #bbb; }
  .coa-info { margin-bottom: 6mm; }
  .coa-info td { border: 1px solid #bbb; padding: .55em 1em; font-weight: 600; }
  .coa-info td:first-child { width: 38mm; }
  .coa-info td:last-child { text-align: center; }
  .coa-spec { table-layout: auto; margin-bottom: 5mm; }
  .coa-spec th { border: 1px solid #bbb; padding: .6em .7em; font-size: .95em; font-weight: 700; text-transform: uppercase; text-align: center; }
  .coa-spec td { border: 1px solid #bbb; padding: .5em .7em; font-size: .95em; text-align: center; }
  .coa-spec .sno { width: 12mm; }
  .coa-spec td.res { font-weight: 600; }
  .coa-remarks { font-size: .9em; margin: 2mm 0 4mm; }
  .coa-sign { margin: 2mm 0 4mm; }
  .coa-sign th, .coa-sign td { border: 1px solid #bbb; padding: .6em; text-align: center; font-size: .95em; }
  .coa-sign td { height: 12mm; }
  .coa-note { font-size: .85em; color: #666; text-align: center; font-style: italic; margin: 3mm 0 4mm; }
  .coa-foot { margin-top: auto; border-top: 2px solid #1a1a2e; padding-top: 3mm; text-align: center; }
  .coa-foot .fc { font-size: .92em; font-weight: 700; margin-bottom: 1mm; }
  .coa-foot .fa { font-size: .84em; color: #444; line-height: 1.6; }

  @media print {
    @page { size: A4; margin: 0; }
    html, body { background: #fff !important; }
    body * { visibility: hidden !important; }
    .coa-print-root, .coa-print-root * { visibility: visible !important; }
    .coa-print-root { position: absolute; left: 0; top: 0; display: block; padding: 0; overflow: visible; }
    .coa-pick, .coa-wrap.skip { display: none !important; }
    .coa-wrap { break-after: page; page-break-after: always; }
    .coa-wrap:last-child { break-after: auto; page-break-after: auto; }
    .coa-sheet { box-shadow: none; cursor: default; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .coa-spec thead { display: table-header-group; }
    .coa-spec tr { break-inside: avoid; }
  }
`;
