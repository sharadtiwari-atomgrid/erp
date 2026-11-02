"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { NAVIGATION } from "@/lib/navigation";
import { MODULES, type Level, type Module, type Permissions } from "@/lib/permissions";

const LEVELS: Level[] = ["none", "view", "edit"];

export function RoleForm({
  action,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: { name: string; description: string | null; fullAccess: boolean; permissions: Permissions };
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [fullAccess, setFullAccess] = useState(initial?.fullAccess ?? false);
  const err = state?.fieldErrors ?? {};
  const sections = NAVIGATION.map((g) => ({
    ...g,
    modules: (Object.keys(MODULES) as Module[]).filter((m) => MODULES[m].section === g.key && m !== "dashboard"),
  })).filter((g) => g.modules.length > 0);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Description" htmlFor="description" errors={err.description}>
              <Input id="description" name="description" defaultValue={initial?.description ?? ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                name="fullAccess"
                checked={fullAccess}
                onChange={(e) => setFullAccess(e.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              Full access (administrator): every module, including settings
            </label>
          </FormGrid>
        </CardBody>
      </Card>

      <Card className={fullAccess ? "opacity-50" : undefined}>
        <CardHeader title="Module access" description="None hides the module; View allows reading; Edit allows creating and changing records." />
        <div className="divide-y divide-line">
          {sections.map((section) => (
            <div key={section.key} className="px-5 py-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: section.color }} />
                {section.label}
              </p>
              {section.modules.map((module) => (
                <div key={module} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-sm text-ink">{MODULES[module].label}</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-line text-xs">
                    {LEVELS.map((level) => (
                      <label
                        key={level}
                        className="cursor-pointer border-l border-line px-3 py-1.5 capitalize first:border-l-0 has-checked:bg-brand-600 has-checked:text-white"
                      >
                        <input
                          type="radio"
                          name={`perm.${module}`}
                          value={level}
                          defaultChecked={(initial?.permissions[module] ?? "none") === level}
                          disabled={fullAccess}
                          className="sr-only"
                        />
                        {level}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/settings/roles" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save role</SubmitButton>
      </div>
    </form>
  );
}
