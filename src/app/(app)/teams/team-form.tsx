"use client";

import { useActionState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { TeamType } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/forms";
import { TEAM_TYPE_LABELS } from "./labels";

type Option = { id: string; name: string };

export function TeamForm({
  action,
  initial,
  branches,
  people,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: { name: string; type: TeamType; branchId: string; leadId: string | null };
  branches: Array<Option & { code: string }>;
  people: Option[];
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <Card>
        <CardBody>
          <FormGrid>
            <Field label="Team name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Type" htmlFor="type" required errors={err.type}>
              <Select id="type" name="type" defaultValue={initial?.type ?? "WAREHOUSE"}>
                {Object.entries(TEAM_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Branch" htmlFor="branchId" required errors={err.branchId}>
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Team lead" htmlFor="leadId" errors={err.leadId}>
              <Select id="leadId" name="leadId" defaultValue={initial?.leadId ?? ""}>
                <option value="">No lead</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <SubmitButton>Save team</SubmitButton>
      </div>
    </form>
  );
}
