"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type TripFormValues = {
  vehicleId: string;
  driverId: string | null;
  origin: string;
  destination: string;
  /** IST "YYYY-MM-DDTHH:mm". */
  plannedStart: string;
  freightCost: number;
  notes: string | null;
};

export function TripForm({
  action,
  initial,
  vehicles,
  drivers,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Partial<TripFormValues>;
  vehicles: Array<{ id: string; registrationNo: string; type: string; status: string }>;
  drivers: Array<{ id: string; name: string }>;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Trip" />
        <CardBody>
          <FormGrid>
            <Field label="Vehicle" htmlFor="vehicleId" required errors={err.vehicleId}>
              <Select id="vehicleId" name="vehicleId" defaultValue={initial?.vehicleId ?? ""} required>
                <option value="">Choose vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNo} · {v.type}
                    {v.status !== "AVAILABLE" ? ` (${v.status.replace("_", " ").toLowerCase()})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Driver" htmlFor="driverId" errors={err.driverId} hint="Blank uses the vehicle's assigned driver">
              <Select id="driverId" name="driverId" defaultValue={initial?.driverId ?? ""}>
                <option value="">Assigned driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Origin" htmlFor="origin" required errors={err.origin}>
              <Input id="origin" name="origin" defaultValue={initial?.origin ?? ""} required />
            </Field>
            <Field label="Destination" htmlFor="destination" required errors={err.destination}>
              <Input id="destination" name="destination" defaultValue={initial?.destination ?? ""} required />
            </Field>
            <Field label="Planned start (IST)" htmlFor="plannedStart" errors={err.plannedStart}>
              <Input id="plannedStart" name="plannedStart" type="datetime-local" defaultValue={initial?.plannedStart ?? ""} />
            </Field>
            <Field label="Freight cost (₹)" htmlFor="freightCost" errors={err.freightCost}>
              <Input id="freightCost" name="freightCost" type="number" min="0" step="0.01" defaultValue={initial?.freightCost ?? 0} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial?.notes ?? ""} />
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save trip</SubmitButton>
      </div>
    </form>
  );
}
