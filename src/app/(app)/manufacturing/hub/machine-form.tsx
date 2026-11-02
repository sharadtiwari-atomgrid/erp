"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MachineStatus } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/forms";

export type MachineFormValues = {
  code: string;
  name: string;
  type: string | null;
  productionUnitId: string;
  hoursPerDay: number;
  hourlyCost: number;
  status: MachineStatus;
  notes: string | null;
};

export function MachineForm({
  action,
  initial,
  units,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Partial<MachineFormValues>;
  units: Array<{ id: string; code: string; name: string; shiftsPerDay: number; shiftHours: number }>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Machine" />
        <CardBody>
          <FormGrid>
            <Field label="Code" htmlFor="code" required errors={err.code}>
              <Input id="code" name="code" defaultValue={initial?.code} required maxLength={20} />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Production unit" htmlFor="productionUnitId" required errors={err.productionUnitId}>
              <Select id="productionUnitId" name="productionUnitId" defaultValue={initial?.productionUnitId ?? units[0]?.id} required>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name} ({u.shiftsPerDay} × {u.shiftHours}h)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="type" errors={err.type} hint="e.g. Cutting, Welding, Assembly">
              <Input id="type" name="type" defaultValue={initial?.type ?? ""} />
            </Field>
            <Field label="Hours per day" htmlFor="hoursPerDay" required errors={err.hoursPerDay} hint="Machine hours available per working day, all shifts">
              <Input id="hoursPerDay" name="hoursPerDay" type="number" min="0" max="24" step="0.25" defaultValue={initial?.hoursPerDay ?? 8} required />
            </Field>
            <Field label="Hourly cost" htmlFor="hourlyCost" required errors={err.hourlyCost} hint="Used in BOM cost roll-ups">
              <Input id="hourlyCost" name="hourlyCost" type="number" min="0" step="0.01" defaultValue={initial?.hourlyCost ?? 0} required />
            </Field>
            <Field label="Status" htmlFor="status" required errors={err.status}>
              <Select id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"}>
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={3} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save machine</SubmitButton>
      </div>
    </form>
  );
}
