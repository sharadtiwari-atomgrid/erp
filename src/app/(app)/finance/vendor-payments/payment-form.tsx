"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { PaymentMethod } from "@/generated/prisma/enums";
import { formatNumber, humanize } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { autoApply } from "../_ar_ap/apply";
import { AmountSummary, ApplicationsEditor, applicationsJson, sumValues, type ApplyDoc } from "../_ar_ap/applications-editor";
import { computeTds, isCompanyDeductee, panOf, tdsRateFor } from "../_ar_ap/tds";

export type PaymentBill = ApplyDoc & { supplierId: string; subtotal: number };
type Supplier = { id: string; code: string; name: string; pan: string | null; gstin: string | null; transporter: boolean };
type Section = { id: string; code: string; description: string; rateIndividual: number; rateCompany: number };

export function VendorPaymentForm({
  action,
  suppliers,
  bankAccounts,
  bills,
  sections,
  today,
  defaultSupplierId,
  defaultBillId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  suppliers: Supplier[];
  bankAccounts: Array<{ id: string; code: string; name: string; kind: string }>;
  bills: PaymentBill[];
  sections: Section[];
  today: string;
  defaultSupplierId?: string;
  defaultBillId?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [apply, setApply] = useState<Record<string, string>>(() => {
    const b = bills.find((x) => x.id === defaultBillId && x.supplierId === defaultSupplierId);
    return b ? { [b.id]: b.balance.toFixed(2) } : {};
  });
  const [settle, setSettle] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [override, setOverride] = useState(false);
  const [tdsManual, setTdsManual] = useState("");
  const [advance, setAdvance] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts.find((b) => b.kind === "BANK")?.id ?? bankAccounts[0]?.id ?? "");

  const supplier = suppliers.find((s) => s.id === supplierId);
  const docs = bills.filter((b) => b.supplierId === supplierId);
  const section = sections.find((s) => s.id === sectionId);
  const rate = section && supplier ? tdsRateFor(section, supplier) : 0;
  const applied = sumValues(apply);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const auto = computeTds(
    Object.entries(apply)
      .filter(([id]) => byId.has(id))
      .map(([id, v]) => ({ amount: Number(v) || 0, bill: { subtotal: byId.get(id)!.subtotal, total: byId.get(id)!.total } })),
    rate,
  );
  const tds = section ? (override ? Number(tdsManual) || 0 : auto.tds) : 0;
  const advanceValue = Number(advance) || 0;
  const cash = Math.round((applied - tds + advanceValue) * 100) / 100;

  function chooseMethod(m: string) {
    setMethod(m);
    const cashAcc = bankAccounts.find((b) => b.kind === "CASH");
    const bank = bankAccounts.find((b) => b.kind === "BANK");
    if (m === "CASH" && cashAcc) setBankAccountId(cashAcc.id);
    else if (m !== "CASH" && bank && bankAccounts.find((b) => b.id === bankAccountId)?.kind === "CASH") setBankAccountId(bank.id);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Payment" description="The number is assigned when you save." />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label="Vendor" htmlFor="supplierId" required errors={err.supplierId}>
              <Select
                id="supplierId"
                name="supplierId"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setApply({});
                }}
                required
              >
                <option value="">Select a vendor…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}){s.transporter ? " · transporter" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Posting Date" htmlFor="date" required errors={err.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Method" htmlFor="method" required errors={err.method}>
              <Select id="method" name="method" value={method} onChange={(e) => chooseMethod(e.target.value)}>
                {Object.values(PaymentMethod).map((m) => (
                  <option key={m} value={m}>
                    {m === "UPI" ? "UPI" : humanize(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pay from" htmlFor="bankAccountId" required errors={err.bankAccountId}>
              <Select id="bankAccountId" name="bankAccountId" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" htmlFor="reference" errors={err.reference} hint="UTR, cheque no.…">
              <Input id="reference" name="reference" />
            </Field>
            <Field label="Advance (not against a purchase invoice)" htmlFor="advance" errors={err.advance} hint="Posted to advances to vendors.">
              <Input id="advance" name="advance" type="number" min="0" step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)} />
            </Field>
            <Field
              label="TDS section"
              htmlFor="tdsSectionId"
              errors={err.tdsSectionId}
              hint={
                supplier
                  ? `${panOf(supplier) ? `PAN ${panOf(supplier)}` : "No PAN on file"} · ${isCompanyDeductee(supplier) ? "company rate" : "individual / other rate"}`
                  : undefined
              }
            >
              <Select id="tdsSectionId" name="tdsSectionId" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">No TDS</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.description} ({formatNumber(s.rateIndividual, 3)}% / {formatNumber(s.rateCompany, 3)}%)
                  </option>
                ))}
              </Select>
            </Field>
            {section && (
              <div>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink">
                  <input type="checkbox" name="tdsOverride" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4 rounded border-line" />
                  Override TDS amount
                </label>
                <Input
                  name="tdsAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label="TDS amount"
                  value={override ? tdsManual : String(auto.tds)}
                  onChange={(e) => setTdsManual(e.target.value)}
                  readOnly={!override}
                />
                <p className="mt-1 text-xs text-ink-faint">
                  {formatNumber(rate, 3)}% on taxable value {formatNumber(auto.base, 2)}
                </p>
              </div>
            )}
            {!section && <input type="hidden" name="tdsAmount" value="0" />}
            <Field label="Notes" htmlFor="notes" errors={err.notes} className={section ? "" : "lg:col-span-2"}>
              <Textarea id="notes" name="notes" rows={1} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Apply Entries"
          description="Each amount settles a purchase invoice (cash plus the TDS withheld on it)."
          actions={
            <>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={settle}
                onChange={(e) => setSettle(e.target.value)}
                placeholder="Amount to settle"
                aria-label="Amount to settle"
                className="h-8 w-36 text-right"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={docs.length === 0 || !(Number(settle) > 0)}
                onClick={() => setApply(Object.fromEntries(Object.entries(autoApply(docs, Number(settle))).map(([k, v]) => [k, v.toFixed(2)])))}
              >
                Auto-apply oldest first
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={docs.length === 0}
                onClick={() => setApply(Object.fromEntries(docs.map((d) => [d.id, d.balance.toFixed(2)])))}
              >
                Apply all
              </Button>
              <Button variant="secondary" size="sm" disabled={docs.length === 0} onClick={() => setApply({})}>
                Clear
              </Button>
            </>
          }
        />
        <ApplicationsEditor
          docs={docs}
          values={apply}
          onChange={setApply}
          today={today}
          docLabel="Bill"
          emptyText={supplierId ? "This vendor has no open purchase invoices. You can still pay an advance." : "Choose a vendor to see their open purchase invoices."}
        />
        <AmountSummary
          rows={[
            { label: "Applied Entries", value: applied },
            { label: "Less TDS withheld", value: tds, tone: "muted" },
            { label: "Plus advance", value: advanceValue, tone: "muted" },
            { label: "Paid from bank", value: cash, strong: true, tone: cash <= 0 ? "danger" : undefined },
          ]}
        />
      </Card>

      <input type="hidden" name="applications" value={applicationsJson(apply)} />
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/finance/vendor-payments" variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">
          Save draft
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…" confirmMessage="Post this payment to the ledger?">
          Save and post
        </SubmitButton>
      </div>
    </form>
  );
}
