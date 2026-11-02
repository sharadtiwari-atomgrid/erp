"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type UnitFormValues = {
  code: string;
  name: string;
  branchId: string;
  address: string | null;
  shiftsPerDay: number;
  shiftStart: string;
  shiftHours: number;
  workingDays: number[];
  notes: string | null;
  isActive: boolean;
};

const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

export function UnitForm({
  action,
  initial,
  branches,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: UnitFormValues;
  branches: Array<{ id: string; code: string; name: string }>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const days = initial?.workingDays ?? [1, 2, 3, 4, 5, 6];

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Unit" />
        <CardBody>
          <FormGrid>
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Short unique code, e.g. PUN-F1">
              <Input id="code" name="code" defaultValue={initial?.code} required maxLength={20} />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Branch" htmlFor="branchId" required errors={err.branchId}>
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? branches[0]?.id} required>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active
              </label>
            </div>
            <Field label="Address" htmlFor="address" errors={err.address} className="sm:col-span-2">
              <Textarea id="address" name="address" defaultValue={initial?.address ?? ""} rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Shifts and working days" description="Used by the auto-scheduler to place work on this unit's machines." />
        <CardBody>
          <FormGrid className="sm:grid-cols-3">
            <Field label="Shifts per day" htmlFor="shiftsPerDay" required errors={err.shiftsPerDay}>
              <Input id="shiftsPerDay" name="shiftsPerDay" type="number" min="1" max="4" defaultValue={initial?.shiftsPerDay ?? 1} required />
            </Field>
            <Field label="First shift starts" htmlFor="shiftStart" required errors={err.shiftStart}>
              <Input id="shiftStart" name="shiftStart" type="time" defaultValue={initial?.shiftStart ?? "09:00"} required />
            </Field>
            <Field label="Hours per shift" htmlFor="shiftHours" required errors={err.shiftHours}>
              <Input id="shiftHours" name="shiftHours" type="number" min="0.5" max="24" step="0.25" defaultValue={initial?.shiftHours ?? 8} required />
            </Field>
          </FormGrid>
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Working days<span className="ml-0.5 text-red-600">*</span>
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {WEEKDAYS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="workingDays" value={value} defaultChecked={days.includes(value)} className="h-4 w-4 rounded border-line" />
                  {label}
                </label>
              ))}
            </div>
            {err.workingDays?.map((e) => (
              <p key={e} className="mt-1 text-xs text-red-600">
                {e}
              </p>
            ))}
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial?.notes ?? ""} rows={3} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save unit</SubmitButton>
      </div>
    </form>
  );
}
