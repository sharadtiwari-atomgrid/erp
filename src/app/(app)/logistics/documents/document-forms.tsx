"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ShippingDocumentForm({
  action,
  outbounds,
  defaults,
  cancelHref,
}: {
  action: Action;
  outbounds: Array<{ id: string; label: string }>;
  defaults: { type: string; outboundId: string; expectedDelivery: string };
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Document" description="The customer is taken from the outbound order's sales order, the trip from the outbound." />
        <CardBody>
          <FormGrid>
            <Field label="Type" htmlFor="type" required errors={err.type}>
              <Select id="type" name="type" defaultValue={defaults.type}>
                <option value="ASN">ASN (advance shipping notice)</option>
                <option value="DN">Delivery note</option>
              </Select>
            </Field>
            <Field label="Outbound order" htmlFor="outboundId" required errors={err.outboundId}>
              <Select id="outboundId" name="outboundId" defaultValue={defaults.outboundId} required>
                <option value="">{outbounds.length ? "Choose outbound order…" : "No packed or dispatched orders"}</option>
                {outbounds.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected delivery (IST)" htmlFor="expectedDelivery" errors={err.expectedDelivery}>
              <Input id="expectedDelivery" name="expectedDelivery" type="datetime-local" defaultValue={defaults.expectedDelivery} />
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Generating…">Generate</SubmitButton>
      </div>
    </form>
  );
}

export function DeliveredForm({ action, now }: { action: Action; now: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Delivered at (IST)" htmlFor="deliveredAt" required errors={err.deliveredAt}>
        <Input id="deliveredAt" name="deliveredAt" type="datetime-local" defaultValue={now} required />
      </Field>
      <Field label="Received by" htmlFor="receivedBy" required errors={err.receivedBy} hint="Name of the person who signed">
        <Input id="receivedBy" name="receivedBy" required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Mark delivered</SubmitButton>
      </div>
    </form>
  );
}
