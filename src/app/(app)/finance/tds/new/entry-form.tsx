"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { defaultRate } from "../_lib/tds";

type SectionOption = { id: string; code: string; description: string; rateIndividual: number; rateCompany: number };
type PartyOption = { id: string; name: string; pan: string | null };

export function ManualEntryForm({
  action,
  kind,
  sections,
  parties,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  kind: string;
  sections: SectionOption[];
  parties: PartyOption[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [contactId, setContactId] = useState("");
  const [base, setBase] = useState("");
  const [rate, setRate] = useState("");
  const section = sections.find((s) => s.id === sectionId);
  const party = parties.find((p) => p.id === contactId);
  const suggested = section ? defaultRate(section, party?.pan) : 0;
  const effectiveRate = rate === "" ? suggested : Number(rate);
  const computed = Math.round(((Number(base) || 0) * effectiveRate) / 100 * 100) / 100;

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Section" htmlFor="sectionId" required errors={err.sectionId}>
          <Select id="sectionId" name="sectionId" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={kind === "TCS" ? "Customer (collectee)" : "Party (deductee)"} htmlFor="contactId" required errors={err.contactId}>
          <Select id="contactId" name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)} required>
            <option value="">Choose…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.pan ? ` (${p.pan})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of deduction / collection" htmlFor="date" required errors={err.date}>
          <Input id="date" name="date" type="date" defaultValue={today} max={today} required />
        </Field>
        <Field label="Document No." htmlFor="documentNo" errors={err.documentNo} hint="E.g. the journal or purchase invoice number.">
          <div className="flex gap-2">
            <Input name="documentType" defaultValue="Manual" aria-label="Document Type" className="w-32" />
            <Input id="documentNo" name="documentNo" placeholder="Number" />
          </div>
        </Field>
        <Field label={kind === "TCS" ? "Amount received" : "Amount paid / credited"} htmlFor="baseAmount" required errors={err.baseAmount}>
          <Input id="baseAmount" name="baseAmount" type="number" step="0.01" min="0.01" value={base} onChange={(e) => setBase(e.target.value)} required />
        </Field>
        <Field
          label="Rate (%)"
          htmlFor="rate"
          errors={err.rate}
          hint={party && !party.pan ? "No PAN on file: a higher rate (206AA / 206CC) may apply." : `Default ${suggested}% for this ${party?.pan?.[3]?.toUpperCase() === "C" ? "company" : "party"}.`}
        >
          <Input id="rate" name="rate" type="number" step="0.001" min="0" max="100" value={rate} placeholder={String(suggested)} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label={`${kind} amount`} htmlFor="amount" errors={err.amount} hint={`Leave blank to use ₹${computed.toFixed(2)}.`}>
          <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder={computed.toFixed(2)} />
        </Field>
      </div>
      <p className="text-xs text-ink-faint">
        A manual entry adds to the {kind} register only; it does not post to the ledger. Post the deduction itself with a journal (Cr {kind} payable).
      </p>
      <div className="flex justify-end gap-2">
        <ButtonLink variant="secondary" href={`/finance/tds?kind=${kind}`}>
          Cancel
        </ButtonLink>
        <SubmitButton>Add entry</SubmitButton>
      </div>
    </form>
  );
}
