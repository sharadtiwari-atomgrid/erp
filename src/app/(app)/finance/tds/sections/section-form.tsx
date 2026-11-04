"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type SectionValues = {
  code: string;
  description: string;
  kind: string;
  rateIndividual: number;
  rateCompany: number;
  thresholdSingle: number | null;
  thresholdAnnual: number | null;
  isActive: boolean;
};

export function SectionForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: SectionValues;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Section" htmlFor="code" required errors={err.code}>
          <Input id="code" name="code" defaultValue={initial.code} placeholder="194C" required />
        </Field>
        <Field label="Description" htmlFor="description" required errors={err.description} className="sm:col-span-2">
          <Input id="description" name="description" defaultValue={initial.description} required />
        </Field>
        <Field label="Kind" htmlFor="kind" errors={err.kind}>
          <Select id="kind" name="kind" defaultValue={initial.kind}>
            <option value="TDS">TDS (deducted on payments)</option>
            <option value="TCS">TCS (collected on sales)</option>
          </Select>
        </Field>
        <Field label="Rate – individual / HUF (%)" htmlFor="rateIndividual" required errors={err.rateIndividual}>
          <Input id="rateIndividual" name="rateIndividual" type="number" step="0.001" min="0" max="100" defaultValue={initial.rateIndividual} required />
        </Field>
        <Field label="Rate – company / firm (%)" htmlFor="rateCompany" required errors={err.rateCompany}>
          <Input id="rateCompany" name="rateCompany" type="number" step="0.001" min="0" max="100" defaultValue={initial.rateCompany} required />
        </Field>
        <Field label="Threshold – single payment (₹)" htmlFor="thresholdSingle" errors={err.thresholdSingle}>
          <Input id="thresholdSingle" name="thresholdSingle" type="number" step="0.01" min="0" defaultValue={initial.thresholdSingle ?? ""} />
        </Field>
        <Field label="Threshold – annual aggregate (₹)" htmlFor="thresholdAnnual" errors={err.thresholdAnnual}>
          <Input id="thresholdAnnual" name="thresholdAnnual" type="number" step="0.01" min="0" defaultValue={initial.thresholdAnnual ?? ""} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} />
          Active (offered on vendor payments)
        </label>
        <div className="flex gap-2">
          {cancelHref && (
            <ButtonLink variant="secondary" href={cancelHref}>
              Cancel
            </ButtonLink>
          )}
          <SubmitButton>Save section</SubmitButton>
        </div>
      </div>
    </form>
  );
}
