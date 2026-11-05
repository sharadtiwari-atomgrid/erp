"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { PaymentMethod } from "@/generated/prisma/enums";
import { humanize } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { autoApply } from "../_ar_ap/apply";
import { AmountSummary, ApplicationsEditor, applicationsJson, sumValues, type ApplyDoc } from "../_ar_ap/applications-editor";

export type ReceiptInvoice = ApplyDoc & { customerId: string };

export function ReceiptForm({
  action,
  customers,
  bankAccounts,
  invoices,
  today,
  defaultCustomerId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customers: Array<{ id: string; code: string; name: string }>;
  bankAccounts: Array<{ id: string; code: string; name: string; kind: string }>;
  invoices: ReceiptInvoice[];
  today: string;
  defaultCustomerId?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts.find((b) => b.kind === "BANK")?.id ?? bankAccounts[0]?.id ?? "");
  const [apply, setApply] = useState<Record<string, string>>({});

  const docs = invoices.filter((i) => i.customerId === customerId);
  const received = Number(amount) || 0;
  const tdsValue = Number(tds) || 0;
  const applied = sumValues(apply);
  const unapplied = Math.round((received + tdsValue - applied) * 100) / 100;

  function chooseMethod(m: string) {
    setMethod(m);
    const cash = bankAccounts.find((b) => b.kind === "CASH");
    const bank = bankAccounts.find((b) => b.kind === "BANK");
    if (m === "CASH" && cash) setBankAccountId(cash.id);
    else if (m !== "CASH" && bank && bankAccounts.find((b) => b.id === bankAccountId)?.kind === "CASH") setBankAccountId(bank.id);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Receipt" description="The number is assigned when you save." />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label="Customer" htmlFor="customerId" required errors={err.customerId}>
              <Select
                id="customerId"
                name="customerId"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setApply({});
                }}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Posting Date" htmlFor="date" required errors={err.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Amount received" htmlFor="amount" required errors={err.amount}>
              <Input id="amount" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
            <Field label="Deposit to" htmlFor="bankAccountId" required errors={err.bankAccountId}>
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
            <Field label="TDS deducted by customer" htmlFor="tdsAmount" errors={err.tdsAmount} hint="Credited to TDS receivable; settles the invoices with the cash.">
              <Input id="tdsAmount" name="tdsAmount" type="number" min="0" step="0.01" value={tds} onChange={(e) => setTds(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="lg:col-span-2">
              <Textarea id="notes" name="notes" rows={1} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Apply Entries"
          description="Each amount settles an invoice (cash plus any TDS). Whatever is left stays on the receipt as a customer advance."
          actions={
            <>
              <Button variant="secondary" size="sm" disabled={docs.length === 0} onClick={() => setApply({})}>
                Clear
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={docs.length === 0 || received + tdsValue <= 0}
                onClick={() => setApply(Object.fromEntries(Object.entries(autoApply(docs, received + tdsValue)).map(([k, v]) => [k, v.toFixed(2)])))}
              >
                Auto-apply oldest first
              </Button>
            </>
          }
        />
        <ApplicationsEditor
          docs={docs}
          values={apply}
          onChange={setApply}
          today={today}
          emptyText={customerId ? "This customer has no open invoices. The whole amount will be a customer advance." : "Choose a customer to see their open invoices."}
        />
        <AmountSummary
          rows={[
            { label: "Amount received", value: received },
            { label: "TDS deducted", value: tdsValue, tone: "muted" },
            { label: "Applied Entries", value: applied },
            { label: unapplied < 0 ? "Over-applied" : "Unapplied (customer advance)", value: unapplied, strong: true, tone: unapplied < -0.004 ? "danger" : undefined },
          ]}
        />
      </Card>

      <input type="hidden" name="applications" value={applicationsJson(apply)} />
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/finance/receipts" variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">
          Save draft
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…" confirmMessage="Post this receipt to the ledger?">
          Save and post
        </SubmitButton>
      </div>
    </form>
  );
}
