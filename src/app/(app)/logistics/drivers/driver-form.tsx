"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; name: string; code?: string };

export type DriverFormValues = {
  name: string;
  phone: string | null;
  licenseNo: string | null;
  licenseUntil: string;
  branchId: string | null;
  transporterId: string | null;
  isActive: boolean;
};

export function DriverForm({
  action,
  initial,
  branches,
  transporters,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: DriverFormValues;
  branches: Option[];
  transporters: Option[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Driver" />
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
            </Field>
            <Field label="Driving licence no." htmlFor="licenseNo" errors={err.licenseNo}>
              <Input id="licenseNo" name="licenseNo" defaultValue={initial?.licenseNo ?? ""} className="uppercase" />
            </Field>
            <Field label="Licence valid until" htmlFor="licenseUntil" errors={err.licenseUntil} hint="Flagged 30 days before expiry">
              <Input id="licenseUntil" name="licenseUntil" type="date" defaultValue={initial?.licenseUntil ?? ""} />
            </Field>
            <Field label="Branch" htmlFor="branchId" errors={err.branchId}>
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? ""}>
                <option value="">Shared (no branch)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Transporter" htmlFor="transporterId" errors={err.transporterId} hint="For drivers employed by a third-party transporter">
              <Select id="transporterId" name="transporterId" defaultValue={initial?.transporterId ?? ""}>
                <option value="">Own employee</option>
                {transporters.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code ? `${t.code} — ${t.name}` : t.name}
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
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save driver</SubmitButton>
      </div>
    </form>
  );
}
