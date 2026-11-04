"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { ASSET_CATEGORIES, METHOD_LABELS } from "../_cash_fa/constants";

export type AssetFormValues = {
  name: string;
  category: string;
  branchId: string | null;
  location: string | null;
  purchaseInvoiceId: string | null;
  acquisitionDate: string;
  cost: number;
  salvageValue: number;
  method: string;
  usefulLifeYears: number | null;
  ratePct: number | null;
  accumulatedDepreciation: number;
  depreciatedTo: string | null;
  notes: string | null;
};

export function AssetForm({
  action,
  initial,
  cancelHref,
  branches,
  invoices,
  locked,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: AssetFormValues;
  cancelHref: string;
  branches: Array<{ id: string; name: string }>;
  invoices: Array<{ id: string; label: string }>;
  /** Acquisition or depreciation already posted: cost, category and dates can't change. */
  locked?: boolean;
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [method, setMethod] = useState(initial?.method ?? "SLM");

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      {locked && (
        <p className="rounded-md border border-line bg-muted/50 px-3 py-2 text-sm text-ink-soft">
          The acquisition or depreciation of this asset is posted, so its category, cost, acquisition date and brought-forward depreciation are fixed. Depreciation settings changed here apply to future runs.
        </p>
      )}
      <Card>
        <CardHeader title="Asset" />
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Category" htmlFor="category" required errors={err.category} hint="Decides the cost account">
              <Select id="category" name="category" defaultValue={initial?.category ?? "Plant & machinery"} disabled={locked}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              {locked && <input type="hidden" name="category" value={initial?.category} />}
            </Field>
            <Field label="Branch" htmlFor="branchId" errors={err.branchId}>
              <Select id="branchId" name="branchId" defaultValue={initial?.branchId ?? ""}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" htmlFor="location" errors={err.location} hint="e.g. Plant 2, first floor">
              <Input id="location" name="location" defaultValue={initial?.location ?? ""} />
            </Field>
            <Field label="Purchase invoice" htmlFor="purchaseInvoiceId" errors={err.purchaseInvoiceId} hint="If bought through a posted bill whose line went to the asset account, no acquisition posting is needed">
              <Select id="purchaseInvoiceId" name="purchaseInvoiceId" defaultValue={initial?.purchaseInvoiceId ?? ""}>
                <option value="">None</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cost & depreciation" />
        <CardBody>
          <FormGrid>
            <Field label="Acquisition date" htmlFor="acquisitionDate" required errors={err.acquisitionDate}>
              <Input id="acquisitionDate" name="acquisitionDate" type="date" defaultValue={initial?.acquisitionDate ?? today} required readOnly={locked} />
            </Field>
            <Field label="Cost" htmlFor="cost" required errors={err.cost}>
              <Input id="cost" name="cost" type="number" min="0.01" step="0.01" defaultValue={initial?.cost} required readOnly={locked} className="text-right tabular-nums" />
            </Field>
            <Field label="Salvage value" htmlFor="salvageValue" errors={err.salvageValue} hint="Book value never goes below this">
              <Input id="salvageValue" name="salvageValue" type="number" min="0" step="0.01" defaultValue={initial?.salvageValue ?? 0} className="text-right tabular-nums" />
            </Field>
            <Field label="Method" htmlFor="method" required errors={err.method}>
              <Select id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {method === "SLM" ? (
              <Field label="Useful life (years)" htmlFor="usefulLifeYears" required errors={err.usefulLifeYears} hint="(cost − salvage) ÷ life per year">
                <Input id="usefulLifeYears" name="usefulLifeYears" type="number" min="0.1" step="0.01" defaultValue={initial?.usefulLifeYears ?? ""} required />
              </Field>
            ) : (
              <Field label="Rate % per year" htmlFor="ratePct" required errors={err.ratePct} hint="Charged on the book value each year">
                <Input id="ratePct" name="ratePct" type="number" min="0.001" max="100" step="0.001" defaultValue={initial?.ratePct ?? ""} required />
              </Field>
            )}
            <div />
            <Field label="Depreciation brought forward" htmlFor="accumulatedDepreciation" errors={err.accumulatedDepreciation} hint="For an asset taken over from earlier books">
              <Input
                id="accumulatedDepreciation"
                name="accumulatedDepreciation"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initial?.accumulatedDepreciation ?? 0}
                readOnly={locked}
                className="text-right tabular-nums"
              />
            </Field>
            <Field label="Depreciated up to" htmlFor="depreciatedTo" errors={err.depreciatedTo} hint="Last day the brought-forward depreciation covers">
              <Input id="depreciatedTo" name="depreciatedTo" type="date" defaultValue={initial?.depreciatedTo ?? ""} readOnly={locked} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial?.notes ?? ""} rows={3} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save asset</SubmitButton>
      </div>
    </form>
  );
}
