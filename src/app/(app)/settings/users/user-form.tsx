"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; name: string };

export function UserForm({
  action,
  initial,
  roles,
  branches,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: { name: string; email: string; roleId: string; branchId: string | null; isActive: boolean };
  roles: Option[];
  branches: Array<Option & { code: string }>;
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
            <Field label="Role" htmlFor="roleId" required errors={err.roleId} hint="Edit what each role can do in Roles & access">
              <Select id="roleId" name="roleId" defaultValue={initial?.roleId ?? roles.find((r) => r.name === "Read-only")?.id}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Branch access" htmlFor="branchId" errors={err.branchId} hint="Restrict the user to one branch's data">
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? ""}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
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
