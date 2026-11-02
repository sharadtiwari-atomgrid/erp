"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Role } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/forms";
import { ROLE_LABELS } from "@/lib/permissions";

export function UserForm({
  action,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: { name: string; email: string; role: Role; isActive: boolean };
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Email" htmlFor="email" required errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={initial?.email} required />
            </Field>
            <Field label="Role" htmlFor="role" required errors={err.role}>
              <Select id="role" name="role" defaultValue={initial?.role ?? "VIEWER"}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={initial ? "New password" : "Password"}
              htmlFor="password"
              required={!initial}
              errors={err.password}
              hint={initial ? "Leave blank to keep the current password" : "At least 8 characters"}
            >
              <Input id="password" name="password" type="password" autoComplete="new-password" required={!initial} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
              Active (can sign in)
            </label>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/settings/users" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save user</SubmitButton>
      </div>
    </form>
  );
}
