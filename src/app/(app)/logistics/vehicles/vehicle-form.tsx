"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; name: string; code?: string };

export type VehicleFormValues = {
  registrationNo: string;
  type: string;
  make: string | null;
  model: string | null;
  capacityKg: number | null;
  ownership: "OWN" | "THIRD_PARTY";
  transporterId: string | null;
  branchId: string | null;
  status: string;
  operatingStart: string | null;
  operatingEnd: string | null;
  insuranceUntil: string;
  fitnessUntil: string;
  permitUntil: string;
  notes: string | null;
};

const TYPES = ["Truck", "Tempo", "Van", "Container", "Trailer", "Pickup", "Two-wheeler"];

export function VehicleForm({
  action,
  initial,
  transporters,
  branches,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: VehicleFormValues;
  transporters: Option[];
  branches: Option[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [ownership, setOwnership] = useState(initial?.ownership ?? "OWN");
  const err = state?.fieldErrors ?? {};
  const onTrip = initial?.status === "ON_TRIP";

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Vehicle" />
        <CardBody>
          <FormGrid>
            <Field label="Registration number" htmlFor="registrationNo" required errors={err.registrationNo} hint="e.g. MH01AB1234">
              <Input id="registrationNo" name="registrationNo" defaultValue={initial?.registrationNo} required className="uppercase" />
            </Field>
            <Field label="Type" htmlFor="type" required errors={err.type}>
              <Input id="type" name="type" list="vehicle-types" defaultValue={initial?.type ?? "Truck"} required />
              <datalist id="vehicle-types">
                {TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Make" htmlFor="make" errors={err.make}>
              <Input id="make" name="make" defaultValue={initial?.make ?? ""} />
            </Field>
            <Field label="Model" htmlFor="model" errors={err.model}>
              <Input id="model" name="model" defaultValue={initial?.model ?? ""} />
            </Field>
            <Field label="Capacity (kg)" htmlFor="capacityKg" errors={err.capacityKg}>
              <Input id="capacityKg" name="capacityKg" type="number" min="0" step="0.01" defaultValue={initial?.capacityKg ?? ""} />
            </Field>
            <Field label="Branch" htmlFor="branchId" errors={err.branchId} hint="Leave blank for a fleet shared by all branches">
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? ""}>
                <option value="">Shared (no branch)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ownership" htmlFor="ownership" required errors={err.ownership}>
              <Select id="ownership" name="ownership" value={ownership} onChange={(e) => setOwnership(e.target.value as "OWN" | "THIRD_PARTY")}>
                <option value="OWN">Own fleet</option>
                <option value="THIRD_PARTY">Third-party (transporter)</option>
              </Select>
            </Field>
            {ownership === "THIRD_PARTY" ? (
              <Field label="Transporter" htmlFor="transporterId" required errors={err.transporterId}>
                <Select id="transporterId" name="transporterId" defaultValue={initial?.transporterId ?? ""} required>
                  <option value="">Choose a transporter…</option>
                  {transporters.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code ? `${t.code} — ${t.name}` : t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div />
            )}
            <Field
              label="Status"
              htmlFor="status"
              required
              errors={err.status}
              hint={onTrip ? "On a trip: the status changes back when the trip completes." : undefined}
            >
              {onTrip ? (
                <>
                  <Input id="status" value="On trip" disabled />
                  <input type="hidden" name="status" value="AVAILABLE" />
                </>
              ) : (
                <Select id="status" name="status" defaultValue={initial?.status ?? "AVAILABLE"}>
                  <option value="AVAILABLE">Available</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Operating from" htmlFor="operatingStart" errors={err.operatingStart}>
                <Input id="operatingStart" name="operatingStart" type="time" defaultValue={initial?.operatingStart ?? "08:00"} />
              </Field>
              <Field label="Operating until" htmlFor="operatingEnd" errors={err.operatingEnd}>
                <Input id="operatingEnd" name="operatingEnd" type="time" defaultValue={initial?.operatingEnd ?? "20:00"} />
              </Field>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Documents" description="Expiry dates are flagged 30 days ahead." />
        <CardBody>
          <FormGrid className="sm:grid-cols-3">
            <Field label="Insurance valid until" htmlFor="insuranceUntil" errors={err.insuranceUntil}>
              <Input id="insuranceUntil" name="insuranceUntil" type="date" defaultValue={initial?.insuranceUntil ?? ""} />
            </Field>
            <Field label="Fitness valid until" htmlFor="fitnessUntil" errors={err.fitnessUntil}>
              <Input id="fitnessUntil" name="fitnessUntil" type="date" defaultValue={initial?.fitnessUntil ?? ""} />
            </Field>
            <Field label="Permit valid until" htmlFor="permitUntil" errors={err.permitUntil}>
              <Input id="permitUntil" name="permitUntil" type="date" defaultValue={initial?.permitUntil ?? ""} />
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
        <SubmitButton>Save vehicle</SubmitButton>
      </div>
    </form>
  );
}
