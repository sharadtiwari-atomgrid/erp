"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export function FuelForm({
  action,
  vehicles,
  drivers,
  defaultVehicleId,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  vehicles: Array<{ id: string; registrationNo: string; type: string }>;
  drivers: Array<{ id: string; name: string }>;
  defaultVehicleId?: string;
  /** "YYYY-MM-DD" from the server. */
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Vehicle" htmlFor="vehicleId" required errors={err.vehicleId}>
        <Select id="vehicleId" name="vehicleId" defaultValue={defaultVehicleId ?? ""} required>
          <option value="">Choose vehicle…</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registrationNo} · {v.type}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Driver" htmlFor="driverId" errors={err.driverId} hint="Blank uses the vehicle's assigned driver">
        <Select id="driverId" name="driverId" defaultValue="">
          <option value="">Assigned driver</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" htmlFor="date" required errors={err.date}>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="Odometer (km)" htmlFor="odometerKm" errors={err.odometerKm}>
          <Input id="odometerKm" name="odometerKm" type="number" min="0" step="0.1" />
        </Field>
        <Field label="Litres" htmlFor="litres" required errors={err.litres}>
          <Input id="litres" name="litres" type="number" min="0.01" step="0.01" required />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required errors={err.amount}>
          <Input id="amount" name="amount" type="number" min="0" step="0.01" required />
        </Field>
      </div>
      <Field label="Station" htmlFor="station" errors={err.station}>
        <Input id="station" name="station" />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Log fuel</SubmitButton>
      </div>
    </form>
  );
}
