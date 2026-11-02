"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type SupplierFormValues = {
  name: string;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  paymentTermsDays: number;
  notes: string | null;
  isActive: boolean;
};

export function SupplierForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: SupplierFormValues;
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
            <Field label="Name" htmlFor="name" required errors={err.name} className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Email" htmlFor="email" errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" errors={err.gstin} hint="15-character GST number">
              <Input id="gstin" name="gstin" defaultValue={initial?.gstin ?? ""} maxLength={15} />
            </Field>
            <Field label="Payment terms (days)" htmlFor="paymentTermsDays" errors={err.paymentTermsDays}>
              <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min="0" defaultValue={initial?.paymentTermsDays ?? 30} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active
              </label>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardBody>
          <FormGrid>
            <Field label="Address" htmlFor="address" errors={err.address} className="sm:col-span-2">
              <Textarea id="address" name="address" defaultValue={initial?.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city" errors={err.city}>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </Field>
            <Field label="State" htmlFor="state" errors={err.state} hint="Used to decide CGST/SGST vs IGST">
              <Input id="state" name="state" defaultValue={initial?.state ?? ""} />
            </Field>
            <Field label="PIN code" htmlFor="pincode" errors={err.pincode}>
              <Input id="pincode" name="pincode" defaultValue={initial?.pincode ?? ""} />
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
        <SubmitButton>Save supplier</SubmitButton>
      </div>
    </form>
  );
}
