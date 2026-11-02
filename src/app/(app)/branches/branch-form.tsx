"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type BranchValues = {
  code: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  isActive: boolean;
};

export function BranchForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: BranchValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardBody>
          <FormGrid>
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Short unique code, e.g. MUM">
              <Input id="code" name="code" defaultValue={initial?.code} required maxLength={10} className="font-mono uppercase" />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" errors={err.gstin} hint="Each state registration has its own GSTIN">
              <Input id="gstin" name="gstin" defaultValue={initial?.gstin ?? ""} maxLength={15} />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
            <Field label="Address" htmlFor="address" errors={err.address} className="sm:col-span-2">
              <Textarea id="address" name="address" defaultValue={initial?.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city" errors={err.city}>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </Field>
            <Field label="State" htmlFor="state" errors={err.state}>
              <Input id="state" name="state" defaultValue={initial?.state ?? ""} />
            </Field>
            <Field label="PIN code" htmlFor="pincode" errors={err.pincode}>
              <Input id="pincode" name="pincode" defaultValue={initial?.pincode ?? ""} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
              <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
              Active
            </label>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save branch</SubmitButton>
      </div>
    </form>
  );
}
