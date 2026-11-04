"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { GlAccountType } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/forms";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, CASH_FLOW_GROUPS } from "../_gl/ledger";

export type AccountFormValues = {
  code: string;
  name: string;
  type: GlAccountType;
  category: string;
  parentId: string | null;
  isGroup: boolean;
  cashFlowGroup: string;
  directPosting: boolean;
  isActive: boolean;
  description: string | null;
  isSystem?: boolean;
};

export type HeadingOption = { id: string; code: string; name: string; type: GlAccountType };

const CASH_FLOW_LABELS: Record<string, string> = {
  OPERATING: "Operating activities",
  INVESTING: "Investing activities",
  FINANCING: "Financing activities",
  CASH: "Cash & cash equivalents",
  NONE: "Not in cash flow (non-cash)",
};

export function AccountForm({
  action,
  initial,
  headings,
  categories,
  cancelHref,
  selfId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: AccountFormValues;
  headings: HeadingOption[];
  categories: string[];
  cancelHref: string;
  selfId?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [type, setType] = useState<GlAccountType>(initial?.type ?? "ASSET");
  const [isGroup, setIsGroup] = useState(initial?.isGroup ?? false);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Account" description={initial?.isSystem ? "System account: the type is fixed and it can't be deleted." : undefined} />
        <CardBody>
          <FormGrid>
            <Field label="Code" htmlFor="code" required errors={err.code} hint="Unique, e.g. 6150">
              <Input id="code" name="code" defaultValue={initial?.code} required maxLength={20} />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Type" htmlFor="type" required errors={err.type}>
              <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as GlAccountType)} disabled={initial?.isSystem}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              {initial?.isSystem && <input type="hidden" name="type" value={type} />}
            </Field>
            <Field label="Schedule III category" htmlFor="category" required errors={err.category} hint="Pick an existing heading or type a new one">
              <Input id="category" name="category" list="account-categories" defaultValue={initial?.category} required />
              <datalist id="account-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Parent heading" htmlFor="parentId" errors={err.parentId}>
              <Select id="parentId" name="parentId" defaultValue={initial?.parentId ?? ""} key={type}>
                <option value="">— Top level —</option>
                {headings
                  .filter((h) => h.type === type && h.id !== selfId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code} {h.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Cash flow group" htmlFor="cashFlowGroup" errors={err.cashFlowGroup}>
              <Select id="cashFlowGroup" name="cashFlowGroup" defaultValue={initial?.cashFlowGroup ?? "OPERATING"}>
                {CASH_FLOW_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {CASH_FLOW_LABELS[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isGroup" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="h-4 w-4 rounded border-line" />
                Heading (groups other accounts; nothing is posted to it)
              </label>
              {err.isGroup?.map((e) => (
                <p key={e} className="text-xs text-red-600">
                  {e}
                </p>
              ))}
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="directPosting"
                  defaultChecked={initial?.directPosting ?? true}
                  disabled={isGroup}
                  className="h-4 w-4 rounded border-line"
                />
                Direct posting (allowed in manual journals; untick for control accounts posted only by documents)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active (untick to block postings)
              </label>
            </div>
            <Field label="Description" htmlFor="description" errors={err.description} className="sm:col-span-2">
              <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save account</SubmitButton>
      </div>
    </form>
  );
}
