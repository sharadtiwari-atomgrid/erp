"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/ops/dates";
import type { BatchInStock } from "./_lib/batches";
import { normaliseValues } from "./_lib/convert";
import { checkRow, type Issue } from "./_lib/checks";
import { computed, hasContent, labelOf, SECTIONS, type DocKey, type MasterList, type MisValues } from "./_lib/fields";
import type { MisFile } from "./_lib/files";
import { problemText, STEP_LABEL, statusProblems, type Problem } from "./_lib/gates";
import { getMisHistory, removeMisFile, saveMisJob, uploadMisFiles } from "./actions";
import type { HistoryEntry } from "./_server/data";
import { BatchInput, FieldInput, FileInput } from "./editor-fields";
import { PasteModal } from "./paste-modal";

type Initial = {
  id: string | null;
  jobNo: string;
  source: string;
  requestNo: number | null;
  values: MisValues;
  docs: Partial<Record<DocKey, MisFile[]>>;
};

type SaveState = "" | "dirty" | "saving" | "saved" | "error";

/** Fields whose saved form differs from what was last saved (so "1000.50" vs "1000.5" is no change). */
const changed = (base: MisValues, next: MisValues) => {
  const norm = normaliseValues(next);
  const out: MisValues = {};
  for (const [k, v] of Object.entries(next)) if ((base[k] ?? "") !== (norm[k] ?? v ?? "")) out[k] = v;
  return out;
};

/** The form as first shown: a row-menu status change that needs more fields arrives with ?to=. */
function startValues(initial: Initial, toStatus: "INTRANSIT" | "DELIVERED" | null): MisValues {
  if (!toStatus) return initial.values;
  const v: MisValues = { ...initial.values, status: toStatus };
  if (toStatus === "INTRANSIT" && !v.actualEtd) v.actualEtd = todayIso();
  if (toStatus === "DELIVERED" && !v.actualEta) v.actualEta = todayIso();
  return v;
}

export function MisEditor({
  initial,
  masters,
  pocs: initialPocs,
  batches,
  history: initialHistory,
  canEdit,
  openPaste,
  toStatus,
}: {
  initial: Initial;
  masters: Record<MasterList, readonly string[]>;
  pocs: string[];
  batches: BatchInStock[];
  history: HistoryEntry[];
  canEdit: boolean;
  openPaste: boolean;
  toStatus: "INTRANSIT" | "DELIVERED" | null;
}) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [form, setForm] = useState<MisValues>(() => startValues(initial, toStatus));
  /** The row as last loaded / saved: saves send only what changed since. */
  const [saved, setSaved] = useState<MisValues | null>(initial.id ? initial.values : null);
  const [docs, setDocs] = useState(initial.docs);
  const [pocs, setPocs] = useState(initialPocs);
  const [history, setHistory] = useState(initialHistory);
  const [saveState, setSaveState] = useState<SaveState>("");
  const [banner, setBanner] = useState<{ tone: "good" | "warn"; text: string } | null>(() => {
    if (!toStatus) return null;
    const p = statusProblems(startValues(initial, toStatus), initial.values);
    return p.length ? { tone: "warn", text: problemText(p) } : null;
  });
  const [paste, setPaste] = useState(openPaste);

  const idRef = useRef(initial.id);
  const formRef = useRef(form);
  const savedRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingRef = useRef(false);

  const locked = !canEdit;
  const jobNoLocked = initial.source === "fresh-po";
  const derived = useMemo(() => computed(form), [form]);
  const gate: Problem[] = useMemo(() => statusProblems(form, saved), [form, saved]);
  const gateBy = useMemo(() => group(gate), [gate]);
  const issues: Issue[] = useMemo(() => checkRow(form, masters, { pod: docs.pod }), [form, masters, docs.pod]);
  const issuesBy = useMemo(() => group(issues), [issues]);

  const refreshHistory = useCallback((jobId: string) => {
    getMisHistory(jobId)
      .then(setHistory)
      .catch(() => {});
  }, []);

  /** Save what changed (create on the first save). Resolves true when saved. */
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = queue.current.then(async () => {
      const f = formRef.current;
      if (!hasContent(f)) {
        pendingRef.current = false;
        setSaveState("");
        return !idRef.current ? false : true;
      }
      const patch = idRef.current && savedRef.current ? changed(savedRef.current, f) : f;
      if (idRef.current && !Object.keys(patch).length) {
        pendingRef.current = false;
        setSaveState("saved");
        return true;
      }
      setSaveState("saving");
      let res: Awaited<ReturnType<typeof saveMisJob>>;
      try {
        res = await saveMisJob(idRef.current, patch);
      } catch (e) {
        setSaveState("error");
        setBanner({ tone: "warn", text: `⚠ Not saved: ${e instanceof Error ? e.message : String(e)}` });
        return false;
      }
      if (!res.ok) {
        setSaveState("error");
        setBanner({ tone: "warn", text: `⚠ Not saved: ${res.error}` });
        return false;
      }
      const wasNew = !idRef.current;
      idRef.current = res.id;
      savedRef.current = res.values;
      setId(res.id);
      setSaved(res.values);
      // The server decides the Job No. (next free number, or kept when locked / taken).
      if (res.values.jobNo !== formRef.current.jobNo && ("jobNo" in patch || wasNew)) {
        formRef.current = { ...formRef.current, jobNo: res.values.jobNo };
        setForm(formRef.current);
      }
      if (wasNew) window.history.replaceState(null, "", `/b2b/mis?edit=${encodeURIComponent(res.id)}`);
      if (res.notice) setBanner({ tone: "warn", text: res.notice });
      if (!timer.current) pendingRef.current = false;
      setSaveState("saved");
      refreshHistory(res.id);
      return true;
    });
    return queue.current;
  }, [refreshHistory]);

  const update = useCallback(
    (patch: MisValues) => {
      formRef.current = { ...formRef.current, ...patch };
      setForm(formRef.current);
      pendingRef.current = true;
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1000);
    },
    [flush],
  );
  const setField = useCallback((key: string, v: string) => update({ [key]: v }), [update]);

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Distance from the two pincodes, once per pair, only while the distance is blank.
  const distKey = useRef("");
  const { pickupPincode: pinA = "", dropPincode: pinB = "", distanceApprox } = form;
  useEffect(() => {
    const a = pinA.trim();
    const b = pinB.trim();
    if (!/^\d{6}$/.test(a) || !/^\d{6}$/.test(b) || String(distanceApprox ?? "").trim() || locked) return;
    const key = `${a}->${b}`;
    if (distKey.current === key) return;
    distKey.current = key;
    let alive = true;
    fetch(`/api/distance?from=${a}&to=${b}`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; km?: number }) => {
        if (alive && d?.ok && typeof d.km === "number" && !String(formRef.current.distanceApprox ?? "").trim()) setField("distanceApprox", String(d.km));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pinA, pinB, distanceApprox, locked, setField]);

  function leave() {
    if (pendingRef.current && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    if (timer.current) clearTimeout(timer.current);
    pendingRef.current = false;
    router.push("/b2b/mis");
  }

  async function saveAndClose() {
    if (!hasContent(formRef.current)) {
      setBanner({ tone: "warn", text: "Add a customer, product or supplier before saving." });
      return;
    }
    const ok = await flush();
    if (!ok) return;
    if (gate.length) {
      setBanner({ tone: "warn", text: `Saved, except the status change. ${problemText(gate)}` });
      return;
    }
    router.push("/b2b/mis");
    router.refresh();
  }

  function addPoc(v: string) {
    const t = v.trim();
    if (t && !pocs.some((n) => n.toLowerCase() === t.toLowerCase())) setPocs((l) => [...l, t].sort((a, b) => a.localeCompare(b)));
  }

  async function upload(field: DocKey, picked: File[]): Promise<string | null> {
    if (!idRef.current) return "Save the entry first.";
    if (pendingRef.current) await flush();
    const fd = new FormData();
    for (const p of picked) fd.append("file", p);
    const res = await uploadMisFiles(idRef.current, field, fd);
    if (!res.ok) return res.error;
    applyFiles(field, res.files, res.status);
    if (res.note) setBanner({ tone: res.problems?.length ? "warn" : "good", text: res.note });
    return null;
  }

  async function remove(field: DocKey, f: MisFile): Promise<string | null> {
    if (!f.id) return null;
    const res = await removeMisFile(f.id);
    if (!res.ok) return res.error;
    applyFiles(field, res.files, res.status);
    return null;
  }

  function applyFiles(field: DocKey, files: MisFile[], status: string) {
    setDocs((d) => ({ ...d, [field]: files }));
    if (savedRef.current && status !== savedRef.current.status) {
      savedRef.current = { ...savedRef.current, status };
      setSaved(savedRef.current);
      formRef.current = { ...formRef.current, status };
      setForm(formRef.current);
    }
    if (idRef.current) refreshHistory(idRef.current);
  }

  function applyPaste(values: MisValues) {
    setPaste(false);
    update(values);
    const n = Object.keys(values).length;
    setBanner({ tone: "good", text: `Filled ${n} field${n === 1 ? "" : "s"} from the pasted email. Check them below.` });
  }

  const saveText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "✓ Saved automatically"
        : saveState === "dirty"
          ? "● Unsaved changes: saving shortly…"
          : saveState === "error"
            ? "⚠ Not saved"
            : !id
              ? "Saves automatically once it has a customer, product or supplier."
              : "Changes save automatically.";

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-canvas/95 px-1 py-2 backdrop-blur">
        <span className={cn("text-xs font-semibold", saveState === "error" ? "text-red-600" : "text-ink-soft")} aria-live="polite">
          {saveText}
        </span>
        <span className="flex-1" />
        {canEdit && (
          <Button variant="secondary" onClick={() => setPaste(true)}>
            Paste from email
          </Button>
        )}
        <Button variant="secondary" onClick={leave}>
          Back to list
        </Button>
        {canEdit && <Button onClick={saveAndClose}>{id ? "Save & close" : "Save entry"}</Button>}
      </div>

      {banner && (
        <div
          role="status"
          className={cn(
            "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            banner.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <span>{banner.text}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setBanner(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {jobNoLocked && (
        <p className="text-sm text-ink-soft">
          Completing <strong>Job No. {form.jobNo}</strong>
          {initial.requestNo ? ` (from Fresh PO #${initial.requestNo})` : " (from Fresh PO)"}. The Job No. is fixed.
        </p>
      )}

      {gate.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong className="text-red-700">{problemText(gate)}</strong>
          <p className="mt-0.5">
            Everything else saves as usual; the {gate.some((g) => g.step !== "Paid") ? "status" : "payment status"} changes once these are filled.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {gate.map((g, i) => (
              <li key={i}>
                <b>{g.label}</b>: {g.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>
            ⚠ {issues.length} thing{issues.length === 1 ? "" : "s"} to check
          </strong>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((x, i) => (
              <li key={i}>
                <b>{labelOf(x.key)}:</b> {x.msg}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-amber-700">These don&apos;t stop saving: fix them when you can.</p>
        </div>
      )}

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader title={section.title} />
          <CardBody>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((f) => {
                const fieldLocked = locked || (f.key === "jobNo" && jobNoLocked);
                const isDoc = f.type === "file";
                return (
                  <div key={f.key} className={cn("flex min-w-0 flex-col gap-1", f.type === "textarea" && "sm:col-span-2")}>
                    <label htmlFor={isDoc ? undefined : `mis-${f.key}`} className="text-xs font-semibold text-ink-soft">
                      {f.label}
                    </label>
                    {isDoc ? (
                      <FileInput
                        label={f.label}
                        files={docs[f.key as DocKey] ?? []}
                        disabled={locked || !id}
                        disabledNote={!id && !locked ? "Upload after the entry is saved (add a customer, product or supplier)." : undefined}
                        onUpload={(p) => upload(f.key as DocKey, p)}
                        onRemove={(file) => remove(f.key as DocKey, file)}
                      />
                    ) : f.type === "batch" ? (
                      <BatchInput
                        value={form.batchNo ?? ""}
                        onChange={(v) => setField("batchNo", v)}
                        disabled={fieldLocked}
                        batches={batches}
                        product={form.productName ?? ""}
                        quantity={form.quantityKgs ?? ""}
                      />
                    ) : (
                      <FieldInput
                        f={f}
                        value={f.type === "computed" ? derived[f.key as keyof typeof derived] : (form[f.key] ?? "")}
                        onChange={(v) => setField(f.key, v)}
                        disabled={fieldLocked}
                        masters={masters}
                        pocs={pocs}
                        onPocBlur={addPoc}
                      />
                    )}
                    {(gateBy[f.key] ?? []).map((g, i) => (
                      <span key={`g${i}`} className="text-xs font-semibold text-red-600">
                        Needed to mark it {STEP_LABEL[g.step]}
                      </span>
                    ))}
                    {(issuesBy[f.key] ?? []).map((x, i) => (
                      <span key={i} className="text-xs text-amber-700">
                        {x.msg}
                        {x.fix && canEdit && (
                          <button
                            type="button"
                            className="ml-1.5 rounded-full border border-amber-300 bg-surface px-2 py-px text-amber-800 hover:bg-amber-50"
                            onClick={() => setField(f.key, x.fix!)}
                          >
                            Use “{x.fix}”
                          </button>
                        )}
                      </span>
                    ))}
                    {f.key === "jobNo" && jobNoLocked ? (
                      <span className="text-xs text-ink-faint">From Fresh PO: fixed</span>
                    ) : (
                      f.hint && <span className="text-xs text-ink-faint">{f.hint}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ))}

      {id && <HistoryPanel entries={history} />}

      {paste && <PasteModal current={form} lockJobNo={jobNoLocked && !!id} onClose={() => setPaste(false)} onApply={applyPaste} />}
    </div>
  );
}

function group<T extends { key: string }>(list: T[]): Record<string, T[]> {
  const m: Record<string, T[]> = {};
  for (const x of list) (m[x.key] ||= []).push(x);
  return m;
}

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  status: "Status changed",
  deleted: "Deleted",
  restored: "Restored",
  imported: "Sheet import",
  moved: "Moved",
};

function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Card>
      <details>
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-ink">
          Change history <span className="font-normal text-ink-soft">({entries.length ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : "nothing recorded yet"})</span>
        </summary>
        <div className="divide-y divide-line border-t border-line">
          {entries.map((h) => (
            <div key={h.id} className="px-5 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <strong className="text-ink">{ACTION_LABEL[h.action] ?? h.action}</strong>
                <span className="text-ink-soft tabular-nums">
                  {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {h.who && <span className="text-ink-soft">{h.who}</span>}
                <span className="text-ink-faint">{h.message}</span>
              </div>
              {h.changes.map((c, i) => (
                <div key={i} className="pl-3 text-ink-soft">
                  {c.field}: <s className="opacity-70">{c.from}</s> → <b className="text-ink">{c.to}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
