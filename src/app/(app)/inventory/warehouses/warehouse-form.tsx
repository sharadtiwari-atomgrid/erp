"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type WarehouseFormValues = {
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

export function WarehouseForm({
  action,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: WarehouseFormValues;
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
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Short unique code, e.g. MUM">
              <Input id="code" name="code" defaultValue={initial?.code} required maxLength={10} className="font-mono uppercase" />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Address" htmlFor="address" errors={err.address} className="sm:col-span-2">
              <Textarea id="address" name="address" defaultValue={initial?.address ?? ""} />
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

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save warehouse</SubmitButton>
      </div>
    </form>
  );
}
