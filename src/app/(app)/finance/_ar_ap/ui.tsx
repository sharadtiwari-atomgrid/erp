import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PrintButton } from "@/components/ui/print-button";
import { formatMoney } from "@/lib/format";
import type { getCompany } from "@/lib/options";
import { cn } from "@/lib/cn";

/** Status badge that also colours POSTED (not in the shared map). */
export function DocStatus({ status }: { status: string }) {
  if (status === "POSTED") return <Badge tone="blue">Posted</Badge>;
  return <StatusBadge status={status} />;
}

/** Right-aligned money cell content; negatives in red brackets, zero as a dash. */
export function Amount({ value, dashZero = false, className }: { value: number; dashZero?: boolean; className?: string }) {
  if (dashZero && Math.abs(value) < 0.005) return <span className={cn("text-ink-faint", className)}>—</span>;
  if (value < -0.004) return <span className={cn("text-red-600", className)}>({formatMoney(-value)})</span>;
  return <span className={className}>{formatMoney(value)}</span>;
}

type Company = Awaited<ReturnType<typeof getCompany>>;

/**
 * Printable A4 sheet for receipts, payment advices and bills: company
 * header, document meta, party block, a body, and a signature footer.
 */
export function PrintSheet({
  title,
  backHref,
  company,
  meta,
  partyLabel,
  party,
  children,
  footerNote,
}: {
  title: string;
  backHref: string;
  company: Company;
  meta: Array<{ label: string; value: ReactNode }>;
  partyLabel: string;
  party: { name: string; gstin?: string | null; pan?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null };
  children: ReactNode;
  footerNote?: ReactNode;
}) {
  const full = "id" in company ? company : null;
  const place = (p: { city?: string | null; state?: string | null; pincode?: string | null }) =>
    [p.city, [p.state, p.pincode].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
          <span aria-hidden>←</span> Back
        </Link>
        <PrintButton />
      </div>
      <article className="rounded-lg border border-line bg-surface p-8 text-sm text-ink shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div className="max-w-sm">
            <p className="text-xl font-bold">{company.name}</p>
            {full?.legalName && full.legalName !== company.name && <p className="text-xs">{full.legalName}</p>}
            {full?.address && <p className="mt-1 whitespace-pre-line text-xs">{full.address}</p>}
            {full && place(full) && <p className="text-xs">{place(full)}</p>}
            {full?.gstin && (
              <p className="mt-1 text-xs font-semibold">
                GSTIN: <span className="font-mono">{full.gstin}</span>
                {full.pan && <span className="ml-3 font-normal">PAN: {full.pan}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{title}</p>
            <dl className="mt-2 space-y-0.5 text-xs">
              {meta.map((m) => (
                <div key={m.label} className="flex justify-end gap-3">
                  <dt className="text-ink-soft">{m.label}</dt>
                  <dd className="min-w-28 font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <section className="border-b border-line py-4 text-xs">
          <p className="font-semibold uppercase tracking-wide text-ink-soft">{partyLabel}</p>
          <p className="mt-1 text-sm font-semibold">{party.name}</p>
          {party.address && <p className="whitespace-pre-line">{party.address}</p>}
          {place(party) && <p>{place(party)}</p>}
          <p className="mt-1">
            {party.gstin ? (
              <>
                GSTIN: <span className="font-mono font-medium">{party.gstin}</span>
              </>
            ) : (
              "Unregistered"
            )}
            {party.pan && <span className="ml-3">PAN: {party.pan}</span>}
          </p>
        </section>
        <div className="mt-4">{children}</div>
        <footer className="mt-10 flex items-end justify-between gap-6 break-inside-avoid text-xs">
          <div className="max-w-md">{footerNote}</div>
          <div className="text-right">
            <p>For {full?.legalName ?? company.name}</p>
            <p className="mt-12 border-t border-line pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

export const printCell = "border border-line px-2 py-1.5";
