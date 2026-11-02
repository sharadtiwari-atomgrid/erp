"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { ewayValidityDays, ewayValidUntil, parseIstDateTime } from "../_lib/eway";

export type EwbInvoiceOption = { id: string; label: string; toPlace: string };

const istFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function EwayBillForm({
  action,
  invoices,
  vehicles,
  transporters,
  defaults,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  invoices: EwbInvoiceOption[];
  vehicles: Array<{ id: string; registrationNo: string; type: string }>;
  transporters: Array<{ id: string; name: string; code: string }>;
  defaults: { invoiceId: string; fromPlace: string; generatedAt: string; vehicleId: string };
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [invoiceId, setInvoiceId] = useState(defaults.invoiceId);
  const [toPlace, setToPlace] = useState(() => invoices.find((i) => i.id === defaults.invoiceId)?.toPlace ?? "");
  const [distance, setDistance] = useState("");
  const [generatedAt, setGeneratedAt] = useState(defaults.generatedAt);

  const km = Number(distance);
  const generated = parseIstDateTime(generatedAt);
  const preview = km > 0 && generated ? ewayValidUntil(generated, km) : null;

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="E-way bill" description="Generate the EWB on ewaybillgst.gov.in, then record its number here." />
        <CardBody>
          <FormGrid>
            <Field label="Invoice" htmlFor="invoiceId" required errors={err.invoiceId}>
              <Select
                id="invoiceId"
                name="invoiceId"
                value={invoiceId}
                required
                onChange={(e) => {
                  setInvoiceId(e.target.value);
                  const inv = invoices.find((i) => i.id === e.target.value);
                  if (inv && !toPlace) setToPlace(inv.toPlace);
                }}
              >
                <option value="">Choose invoice…</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="EWB number" htmlFor="number" required errors={err.number} hint="12 digits, as shown on the portal">
              <Input id="number" name="number" inputMode="numeric" maxLength={14} placeholder="1234 5678 9012" required className="font-mono" />
            </Field>
            <Field label="Generated at (IST)" htmlFor="generatedAt" required errors={err.generatedAt}>
              <Input id="generatedAt" name="generatedAt" type="datetime-local" value={generatedAt} onChange={(e) => setGeneratedAt(e.target.value)} required />
            </Field>
            <Field label="Approx. distance (km)" htmlFor="distanceKm" required errors={err.distanceKm}>
              <Input id="distanceKm" name="distanceKm" type="number" min="1" max="4000" step="1" value={distance} onChange={(e) => setDistance(e.target.value)} required />
            </Field>
            <Field label="From place" htmlFor="fromPlace" required errors={err.fromPlace}>
              <Input id="fromPlace" name="fromPlace" defaultValue={defaults.fromPlace} required />
            </Field>
            <Field label="To place" htmlFor="toPlace" required errors={err.toPlace}>
              <Input id="toPlace" name="toPlace" value={toPlace} onChange={(e) => setToPlace(e.target.value)} required />
            </Field>
          </FormGrid>
          <div className="mt-4 rounded-md border border-line bg-muted/50 px-3 py-2 text-sm">
            {preview ? (
              <>
                Valid for <strong>{ewayValidityDays(km)} day{ewayValidityDays(km) === 1 ? "" : "s"}</strong>, until{" "}
                <strong>{istFormat.format(preview)}</strong> IST.
              </>
            ) : (
              <span className="text-ink-soft">Enter the distance to see the validity (1 day per 200 km or part, ending at midnight).</span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Transport (Part B)" />
        <CardBody>
          <FormGrid>
            <Field label="Vehicle" htmlFor="vehicleId" errors={err.vehicleId}>
              <Select id="vehicleId" name="vehicleId" defaultValue={defaults.vehicleId}>
                <option value="">Not in fleet, type the number →</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNo} · {v.type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vehicle number" htmlFor="vehicleNo" errors={err.vehicleNo} hint="Only when the vehicle isn't in the fleet list">
              <Input id="vehicleNo" name="vehicleNo" className="uppercase" />
            </Field>
            <Field label="Transporter" htmlFor="transporterId" errors={err.transporterId} hint="Defaults to the vehicle's transporter">
              <Select id="transporterId" name="transporterId" defaultValue="">
                <option value="">—</option>
                {transporters.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes}>
              <Textarea id="notes" name="notes" rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Record e-way bill</SubmitButton>
      </div>
    </form>
  );
}
