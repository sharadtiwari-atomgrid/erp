import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney, formatNumber, num } from "@/lib/format";
import type { getCompany } from "@/lib/options";
import { round2, splitGst } from "@/lib/totals";
import { amountInWords } from "../_lib/amount-in-words";
import { PrintButton } from "./print-button";

type Numeric = number | string | { toString(): string };
type Company = Awaited<ReturnType<typeof getCompany>>;

export type PrintLine = {
  id: string;
  description: string | null;
  quantity: Numeric;
  unitPrice: Numeric;
  discountPct: Numeric;
  taxRate: Numeric;
  taxAmount: Numeric;
  lineTotal: Numeric;
  product: { sku: string; name: string; unit: string; hsnCode: string | null };
};

export type PrintParty = {
  name: string;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
};

/** Company settings with every optional field present (getCompany() may return a bare fallback). */
function companyDetails(company: Company) {
  const full = "id" in company ? company : null;
  return {
    name: company.name,
    legalName: full?.legalName ?? null,
    gstin: full?.gstin ?? null,
    pan: full?.pan ?? null,
    email: full?.email ?? null,
    phone: full?.phone ?? null,
    address: full?.address ?? null,
    city: full?.city ?? null,
    state: company.state,
    pincode: full?.pincode ?? null,
  };
}

function cityLine(p: { city: string | null; state: string | null; pincode: string | null }) {
  return [p.city, [p.state, p.pincode].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
}

/** Groups lines by HSN/SAC and GST rate for the tax summary required on a GST invoice. */
function hsnSummary(lines: PrintLine[], companyState: string | null, placeOfSupply: string | null) {
  const groups = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  for (const l of lines) {
    const hsn = l.product.hsnCode ?? "—";
    const rate = num(l.taxRate);
    const key = `${hsn}|${rate}`;
    const g = groups.get(key) ?? { hsn, rate, taxable: 0, tax: 0 };
    g.taxable = round2(g.taxable + num(l.lineTotal));
    g.tax = round2(g.tax + num(l.taxAmount));
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, ...splitGst(g.tax, companyState, placeOfSupply) }));
}

const cell = "border border-slate-300 px-2 py-1.5";

/**
 * Printable quotation / GST tax invoice. Renders a screen toolbar (hidden when
 * printing) and an A4-friendly sheet.
 */
export function PrintDocument({
  title,
  backHref,
  company: rawCompany,
  meta,
  party,
  placeOfSupply,
  lines,
  subtotal,
  taxTotal,
  total,
  extraTotals,
  notes,
}: {
  title: string;
  backHref: string;
  company: Company;
  meta: Array<{ label: string; value: ReactNode }>;
  party: PrintParty;
  placeOfSupply: string | null;
  lines: PrintLine[];
  subtotal: Numeric;
  taxTotal: Numeric;
  total: Numeric;
  extraTotals?: Array<{ label: string; value: Numeric }>;
  notes?: string | null;
}) {
  const company = companyDetails(rawCompany);
  const gst = splitGst(num(taxTotal), company.state, placeOfSupply);
  const summary = hsnSummary(lines, company.state, placeOfSupply);

  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
          <span aria-hidden>←</span> Back
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-lg border border-line bg-white p-8 text-sm text-slate-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
          <div className="max-w-sm">
            <p className="text-xl font-bold">{company.name}</p>
            {company.legalName && company.legalName !== company.name && <p className="text-xs">{company.legalName}</p>}
            {company.address && <p className="mt-1 whitespace-pre-line text-xs">{company.address}</p>}
            {cityLine(company) && <p className="text-xs">{cityLine(company)}</p>}
            <p className="mt-1 text-xs">
              {[company.phone, company.email].filter(Boolean).join(" · ")}
            </p>
            {company.gstin && (
              <p className="mt-1 text-xs font-semibold">
                GSTIN: <span className="font-mono">{company.gstin}</span>
                {company.pan && <span className="ml-3 font-normal">PAN: {company.pan}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{title}</p>
            <dl className="mt-2 space-y-0.5 text-xs">
              {meta.map((m) => (
                <div key={m.label} className="flex justify-end gap-3">
                  <dt className="text-slate-500">{m.label}</dt>
                  <dd className="min-w-28 font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-slate-300 py-4 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
            <p className="mt-1 text-sm font-semibold">{party.name}</p>
            {party.address && <p className="whitespace-pre-line">{party.address}</p>}
            {cityLine(party) && <p>{cityLine(party)}</p>}
            {(party.phone || party.email) && <p>{[party.phone, party.email].filter(Boolean).join(" · ")}</p>}
            <p className="mt-1">
              GSTIN: <span className="font-mono font-medium">{party.gstin ?? "Unregistered"}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Place of supply</p>
            <p className="mt-1 text-sm font-medium">{placeOfSupply ?? "—"}</p>
            <p className="mt-1">{gst.interState ? "Inter-state supply (IGST)" : "Intra-state supply (CGST + SGST)"}</p>
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className={`${cell} w-8 text-left`}>#</th>
              <th className={`${cell} text-left`}>Item</th>
              <th className={`${cell} text-left`}>HSN/SAC</th>
              <th className={`${cell} text-right`}>Qty</th>
              <th className={`${cell} text-right`}>Rate</th>
              <th className={`${cell} text-right`}>Disc %</th>
              <th className={`${cell} text-right`}>Taxable value</th>
              <th className={`${cell} text-right`}>GST %</th>
              <th className={`${cell} text-right`}>GST</th>
              <th className={`${cell} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="break-inside-avoid align-top">
                <td className={cell}>{i + 1}</td>
                <td className={cell}>
                  <p className="font-medium">{l.product.name}</p>
                  {l.description && <p className="text-slate-600">{l.description}</p>}
                </td>
                <td className={`${cell} font-mono`}>{l.product.hsnCode ?? "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatNumber(l.quantity)} {l.product.unit}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(l.unitPrice)}</td>
                <td className={`${cell} text-right tabular-nums`}>{num(l.discountPct) > 0 ? formatNumber(l.discountPct, 2) : "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(l.lineTotal)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatNumber(l.taxRate, 2)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(l.taxAmount)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(num(l.lineTotal) + num(l.taxAmount))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 flex flex-wrap items-start justify-between gap-6 break-inside-avoid">
          <div className="max-w-sm text-xs">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Amount in words</p>
            <p className="mt-1 font-medium">{amountInWords(num(total))}</p>
          </div>
          <dl className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Taxable value</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            {gst.interState ? (
              <div className="flex justify-between">
                <dt>IGST</dt>
                <dd className="tabular-nums">{formatMoney(gst.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt>CGST</dt>
                  <dd className="tabular-nums">{formatMoney(gst.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>SGST</dt>
                  <dd className="tabular-nums">{formatMoney(gst.sgst)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </div>
            {extraTotals?.map((row) => (
              <div key={row.label} className="flex justify-between">
                <dt>{row.label}</dt>
                <dd className="tabular-nums">{formatMoney(row.value)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <table className="mt-6 w-full border-collapse break-inside-avoid text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className={`${cell} text-left`}>HSN/SAC</th>
              <th className={`${cell} text-right`}>Taxable value</th>
              {gst.interState ? (
                <th className={`${cell} text-right`}>IGST</th>
              ) : (
                <>
                  <th className={`${cell} text-right`}>CGST</th>
                  <th className={`${cell} text-right`}>SGST</th>
                </>
              )}
              <th className={`${cell} text-right`}>Total tax</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((g) => (
              <tr key={`${g.hsn}|${g.rate}`}>
                <td className={`${cell} font-mono`}>{g.hsn}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(g.taxable)}</td>
                {gst.interState ? (
                  <td className={`${cell} text-right tabular-nums`}>
                    {formatMoney(g.igst)} <span className="text-slate-500">@{formatNumber(g.rate, 2)}%</span>
                  </td>
                ) : (
                  <>
                    <td className={`${cell} text-right tabular-nums`}>
                      {formatMoney(g.cgst)} <span className="text-slate-500">@{formatNumber(g.rate / 2, 2)}%</span>
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>
                      {formatMoney(g.sgst)} <span className="text-slate-500">@{formatNumber(g.rate / 2, 2)}%</span>
                    </td>
                  </>
                )}
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(g.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-8 flex items-end justify-between gap-6 break-inside-avoid text-xs">
          <div className="max-w-md">
            {notes && (
              <>
                <p className="font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-1 whitespace-pre-line">{notes}</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p>For {company.legalName ?? company.name}</p>
            <p className="mt-12 border-t border-slate-400 pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
