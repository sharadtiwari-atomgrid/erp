"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { FRESH_PO_DOC_KINDS } from "@/lib/ops/lists";
import { deletePoDoc, listPoDocs, poHistory, quickAddContact, quickAddProduct, uploadPoDoc } from "./actions";
import { fieldLabel, PHASE_ORDER, PHASES } from "./fields";
import { allMissing } from "./logic";
import type { ContactOption, DocItem, HistoryItem, PoRow, ProductOption } from "./types";

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-lg border border-line bg-surface shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button type="button" className="rounded p-1 text-ink-soft hover:bg-muted hover:text-ink" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

// ─── Pending details ────────────────────────────────────────────────────────

export function PendingModal({ row, onClose, onOpen }: { row: PoRow; onClose: () => void; onOpen: () => void }) {
  const missing = allMissing(row.values);
  return (
    <Modal title={`PO #${row.requestNo} — pending details`} onClose={onClose}>
      <p className="text-sm text-ink-soft">This PO can only move to Operations once every required detail is filled. Still needed:</p>
      <div className="mt-3 space-y-2">
        {PHASE_ORDER.map((p) => (
          <div key={p} className="rounded-md border border-line px-3 py-2">
            <p className="text-sm font-medium text-ink">
              {PHASES[p].label} {missing[p].length === 0 && <span className="text-emerald-700">✓ complete</span>}
            </p>
            {missing[p].length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {missing[p].map((k) => (
                  <span key={k} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-red-600/20 ring-inset">
                    {fieldLabel(k)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onOpen}>Open to complete</Button>
      </ModalActions>
    </Modal>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

export function HistoryModal({ row, onClose }: { row: PoRow; onClose: () => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    poHistory(row.id)
      .then((h) => alive && setItems(h))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [row.id]);
  return (
    <Modal title={`PO #${row.requestNo} — history`} onClose={onClose} wide>
      {items === null ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-soft">No history recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((h) => (
            <li key={h.id} className="border-l-2 border-brand-100 pl-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-ink">{h.action}</span>
                <span className="font-medium text-ink">{h.who}</span>
                <span className="text-ink-faint">{formatDateTime(h.at)}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{h.message}</p>
              {h.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                  {h.changes.map((c) => (
                    <li key={c.field}>
                      <span className="font-medium text-ink">{c.field}</span>: <s>{c.from}</s> → {c.to}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

// ─── Documents ──────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  PO: "Purchase Order",
  PI: "Proforma Invoice",
  COA: "Certificate of Analysis",
  MSDS: "Safety Data Sheet (MSDS)",
  OTHER: "Other",
};

export function DocumentsModal({ row, canEdit, onClose }: { row: PoRow; canEdit: boolean; onClose: () => void }) {
  const [items, setItems] = useState<DocItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    listPoDocs(row.id)
      .then(setItems)
      .catch(() => setItems([]));

  useEffect(() => {
    let alive = true;
    listPoDocs(row.id)
      .then((d) => alive && setItems(d))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [row.id]);

  async function upload(kind: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(kind);
    setError("");
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("poId", row.id);
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await uploadPoDoc(fd).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
      if (!res.ok) setError(`${file.name}: ${res.error}`);
    }
    await load();
    setBusy("");
  }

  async function remove(doc: DocItem) {
    if (!window.confirm(`Delete ${doc.fileName}?`)) return;
    const res = await deletePoDoc(doc.id);
    if (!res.ok) setError(res.error);
    await load();
  }

  return (
    <Modal title={`PO #${row.requestNo} — documents`} onClose={onClose} wide>
      {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {items === null ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {FRESH_PO_DOC_KINDS.map((kind) => {
            const files = items.filter((d) => d.field === kind);
            return (
              <div key={kind} className="rounded-md border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700">{kind}</span>
                  <span className="text-sm text-ink">{DOC_LABELS[kind]}</span>
                  {canEdit && (
                    <label className="ml-auto cursor-pointer rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-muted">
                      {busy === kind ? "Uploading…" : "+ Upload"}
                      <input
                        type="file"
                        multiple
                        hidden
                        disabled={!!busy}
                        onChange={(e) => {
                          void upload(kind, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {files.length === 0 && <li className="text-xs text-ink-faint">None yet</li>}
                  {files.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      <a className="min-w-0 flex-1 truncate text-brand-700 hover:underline" href={d.url} target="_blank" rel="noreferrer" title={d.fileName}>
                        {d.fileName}
                      </a>
                      <a className="text-xs text-ink-soft hover:text-ink" href={d.downloadUrl} title={`Download ${d.fileName}`}>
                        Download
                      </a>
                      {canEdit && (
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void remove(d)}>
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Paste from email ───────────────────────────────────────────────────────

export function PasteModal({ onClose, onApply }: { onClose: () => void; onApply: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <Modal title="Paste from email" onClose={onClose} wide>
      <p className="text-sm text-ink-soft">Copy the PO table from the email and paste it below; the form is filled from the labels it recognises.</p>
      <Textarea className="mt-3 font-mono text-xs" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Customer\tExample Co\nPO Date\t23/09/2026\nProduct Name\t…"} />
      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!text.trim()} onClick={() => onApply(text)}>
          Fill form
        </Button>
      </ModalActions>
    </Modal>
  );
}

// ─── Quick-add masters ──────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function AddContactModal({
  role,
  defaultName,
  onClose,
  onSaved,
}: {
  role: "CUSTOMER" | "SUPPLIER";
  defaultName: string;
  onClose: () => void;
  onSaved: (c: ContactOption) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [poc, setPoc] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const what = role === "CUSTOMER" ? "customer" : "supplier";
  return (
    <Modal title={`Add ${what}`} onClose={onClose}>
      <Row label={role === "CUSTOMER" ? "Customer" : "Supplier"}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Row>
      <Row label={role === "CUSTOMER" ? "Address" : "Pickup address"}>
        <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Row>
      <Row label="Pincode">
        <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
      </Row>
      <Row label={role === "CUSTOMER" ? "Customer POC" : "Supplier POC"}>
        <Input value={poc} onChange={(e) => setPoc(e.target.value)} placeholder="Name · phone" />
      </Row>
      <p className="text-xs text-ink-faint">Creates a contact with the {what} role; complete its details later under Contacts.</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || pending}
          onClick={() =>
            start(async () => {
              const res = await quickAddContact({ role, name, address, pincode, poc });
              if (res.ok) onSaved(res.option);
              else setError(res.error);
            })
          }
        >
          {pending ? "Saving…" : `Save ${what}`}
        </Button>
      </ModalActions>
    </Modal>
  );
}

const PRODUCT_CLASSES = ["Technical", "Formulation", "Intermediate", "Other"];

export function AddProductModal({ defaultName, onClose, onSaved }: { defaultName: string; onClose: () => void; onSaved: (p: ProductOption) => void }) {
  const [name, setName] = useState(defaultName);
  const [productClass, setProductClass] = useState("");
  const [casNo, setCasNo] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Modal title="Add product" onClose={onClose}>
      <Row label="Molecule name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Row>
      <Row label="Technical / Formulation">
        <Select value={productClass} onChange={(e) => setProductClass(e.target.value)}>
          <option value="">— select —</option>
          {PRODUCT_CLASSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Row>
      <Row label="CAS No.">
        <Input value={casNo} onChange={(e) => setCasNo(e.target.value)} />
      </Row>
      <Row label="HSN code">
        <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
      </Row>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || pending}
          onClick={() =>
            start(async () => {
              const res = await quickAddProduct({ name, productClass, casNo, hsnCode });
              if (res.ok) onSaved(res.option);
              else setError(res.error);
            })
          }
        >
          {pending ? "Saving…" : "Save product"}
        </Button>
      </ModalActions>
    </Modal>
  );
}
