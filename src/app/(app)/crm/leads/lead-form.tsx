"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type LeadFormValues = {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  estimatedValue: number;
  ownerId: string | null;
  notes: string | null;
};

const SOURCES = ["Website", "Referral", "Trade show", "Cold call", "Email campaign", "Partner", "Other"];

export function LeadForm({
  action,
  initial,
  owners,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: LeadFormValues;
  owners: Array<{ id: string; name: string }>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <FormGrid>
            <Field label="Contact name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Company" htmlFor="company" errors={err.company} hint="Used as the customer name on conversion">
              <Input id="company" name="company" defaultValue={initial?.company ?? ""} />
            </Field>
            <Field label="Email" htmlFor="email" errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
            <Field label="Source" htmlFor="source" errors={err.source}>
              <Input id="source" name="source" list="lead-sources" defaultValue={initial?.source ?? ""} />
              <datalist id="lead-sources">
                {SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Estimated value (₹)" htmlFor="estimatedValue" errors={err.estimatedValue}>
              <Input
                id="estimatedValue"
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initial?.estimatedValue ?? 0}
              />
            </Field>
            <Field label="Owner" htmlFor="ownerId" errors={err.ownerId}>
              <Select id="ownerId" name="ownerId" defaultValue={initial?.ownerId ?? ""}>
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial?.notes ?? ""} rows={4} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save lead</SubmitButton>
      </div>
    </form>
  );
}
