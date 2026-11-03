"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { applyProductNames, readProductSheet, type ApplyResult } from "./actions";
import { productMatcher, type MatchKind, type NameInUse, type SheetProduct } from "./product-names";

const KIND: Record<Exclude<MatchKind, "exact">, { label: string; tone: string; note: string }> = {
  case: { label: "Capitals / spacing", tone: "bg-emerald-50 text-emerald-700", note: "Same name, written the sheet's way" },
  alias: { label: "Another name for", tone: "bg-emerald-50 text-emerald-700", note: "One of the sheet's Inward / Outward names" },
  close: { label: "Looks like", tone: "bg-amber-50 text-amber-800", note: "Not in the sheet, but very like this product: check it" },
  ambiguous: { label: "Pick one", tone: "bg-amber-50 text-amber-800", note: "An Inward / Outward name of more than one product" },
  unknown: { label: "Not in the sheet", tone: "bg-red-50 text-red-700", note: "Nothing close: pick a product, or keep the name" },
};
const ORDER: Array<keyof typeof KIND> = ["unknown", "ambiguous", "close", "alias", "case"];
const OTHER = "__other";
const usedOn = (r: NameInUse) =>
  [r.mis && `${r.mis} MIS`, r.po && `${r.po} Fresh PO`, r.inward && `${r.inward} inward`, r.outward && `${r.outward} outward`, r.master && "Product master"]
    .filter(Boolean)
    .join(" · ");
const total = (r: NameInUse) => r.mis + r.po + r.inward + r.outward;

export function NameCheck({ names, canApply }: { names: NameInUse[]; canApply: boolean }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<{ file: string; products: SheetProduct[] } | null>(null);
  /** User choices per name ("" = keep); names without a choice use the suggestion. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [show, setShow] = useState<"todo" | "case" | "alias" | "all">("todo");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<ApplyResult | null>(null);

  const rows = useMemo(() => {
    if (!sheet) return [];
    const match = productMatcher(sheet.products);
    return names
      .map((r) => ({ ...r, ...match(r.name) }))
      .filter((r): r is NameInUse & { kind: keyof typeof KIND; to: string; options: string[] } => r.kind !== "exact")
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || total(b) - total(a));
  }, [names, sheet]);
  const exact = sheet ? names.length - rows.length : 0;
  // Sure ones start ticked; close ones wait for a yes.
  const pickOf = (r: (typeof rows)[number]) => overrides[r.name] ?? (r.kind === "case" || r.kind === "alias" ? r.to : "");
  const setPick = (name: string, v: string) => setOverrides((o) => ({ ...o, [name]: v }));

  const chosen = rows.filter((r) => pickOf(r).trim());
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (show === "todo" ? ["unknown", "ambiguous", "close"].includes(r.kind) : show === "all" ? true : r.kind === show) &&
      (!term || `${r.name} ${pickOf(r)}`.toLowerCase().includes(term)),
  );
  const tickClose = () =>
    setOverrides((o) => {
      const x = { ...o };
      for (const r of rows) if (r.kind === "close") x[r.name] = r.to;
      return x;
    });

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await readProductSheet(fd).catch((e) => ({ ok: false as const, error: String(e) }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSheet({ file: res.file, products: res.products });
    setOverrides({});
    setDone(null);
  }

  async function apply() {
    if (!sheet) return;
    if (!window.confirm(`Add / update ${sheet.products.length} products and change ${chosen.length} name(s) on MIS jobs, Fresh POs and inward / outward lines?`)) return;
    setBusy(true);
    setError("");
    const res = await applyProductNames({
      products: sheet.products,
      renames: chosen.map((r) => ({ from: r.name, to: pickOf(r).trim() })),
    }).catch((e) => ({ ok: false as const, error: String(e) }));
    setBusy(false);
    if (!res.ok) {
      setError(`Not applied: ${res.error}`);
      return;
    }
    setDone(res.result);
    setOverrides({});
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className={cn("inline-flex h-9 cursor-pointer items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700", busy && "pointer-events-none opacity-50")}>
          ⬆ Upload Product Master sheet
          <input
            type="file"
            hidden
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {busy && <span className="text-sm text-ink-soft">Working…</span>}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {done && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Done: {done.added} products added and {done.updated} updated; {done.renamed} names changed on {done.mis} MIS jobs, {done.po} Fresh POs, {done.inward} inward
          and {done.outward} outward lines
          {done.removed ? `; ${done.removed} old product rows removed` : ""}
          {done.kept ? `; ${done.kept} old product rows kept because other records use them` : ""}.
        </div>
      )}

      {!sheet ? (
        <Card className="flex flex-col gap-1.5 px-5 py-4 text-sm">
          <b>{names.length} product names are in use</b>
          <span className="text-ink-soft">across the product master, Domestic MIS, Fresh PO and batch inward / outward.</span>
          <span className="text-ink-soft">
            Upload the Product Master sheet (Product ID, Product Name, Inward Name, Outward Name, Product Type, CAS No., Atomgrid HSN Code, Product Funnel) to check them.
          </span>
        </Card>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-ink-soft">
            <b className="text-ink">{sheet.file}</b>: {sheet.products.length} products. Of the {names.length} names in use, <b className="text-ink">{exact}</b> already match.
            {ORDER.map((k) => {
              const n = rows.filter((r) => r.kind === k).length;
              return n ? (
                <span key={k} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND[k].tone)}>
                  {KIND[k].label}: {n}
                </span>
              ) : null;
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-full border border-line" role="tablist">
              {(
                [
                  ["todo", "To decide"],
                  ["case", "Capitals"],
                  ["alias", "Other names"],
                  ["all", "All"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={show === k}
                  className={cn("px-3.5 py-1.5 text-xs font-semibold", show === k ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-muted")}
                  onClick={() => setShow(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <Input type="search" className="max-w-xs" placeholder="Search names…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search names" />
            <Button variant="secondary" size="sm" onClick={tickClose}>
              Accept every “Looks like”
            </Button>
            <span className="flex-1" />
            {canApply ? (
              <Button disabled={busy} onClick={apply}>
                {busy ? "Applying…" : `Apply: ${chosen.length} rename${chosen.length === 1 ? "" : "s"} + ${sheet.products.length} products`}
              </Button>
            ) : (
              <span className="text-xs text-ink-faint">Applying needs edit access to items.</span>
            )}
          </div>
          <datalist id="pc-products">
            {sheet.products.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <Card>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {["Name in use", "Used on", "Match", "Becomes"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-ink-soft">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((r) => {
                    const pick = pickOf(r);
                    const custom = Boolean(pick) && !r.options.includes(pick);
                    return (
                      <tr key={r.name} className={cn("align-top", pick.trim() && "shadow-[inset_3px_0_0_var(--color-brand-500)]")}>
                        <td className="px-3 py-2 font-semibold">{r.name}</td>
                        <td className="px-3 py-2 text-ink-soft">{usedOn(r)}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", KIND[r.kind].tone)} title={KIND[r.kind].note}>
                            {KIND[r.kind].label}
                          </span>
                        </td>
                        <td className="flex min-w-[340px] flex-col gap-1.5 px-3 py-2">
                          <Select
                            value={custom ? OTHER : pick}
                            aria-label={`What ${r.name} becomes`}
                            onChange={(e) => setPick(r.name, e.target.value === OTHER ? pick || " " : e.target.value)}
                          >
                            <option value="">Keep “{r.name}”</option>
                            {r.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                                {o === r.to && r.kind === "close" ? " (suggested)" : ""}
                              </option>
                            ))}
                            <option value={OTHER}>Another product…</option>
                          </Select>
                          {custom && (
                            <Input list="pc-products" placeholder="Type to find a product" value={pick.trim()} onChange={(e) => setPick(r.name, e.target.value || " ")} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!shown.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-ink-faint">
                        Nothing here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">
              Applying adds every sheet product to the product master (with its class, CAS No., HSN, funnel and other names; blank sheet cells don&apos;t clear anything), and
              changes each chosen name on Domestic MIS, Fresh PO and the batch inward / outward <b>AG catalogue name</b>; the supplier&apos;s own product name on inward lines
              is kept. The old name&apos;s product row is deleted when it isn&apos;t in the sheet and nothing else (stock, orders, BOMs…) uses it. A name you keep is left as it
              is. Every change is in the record history.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
