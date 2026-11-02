"use client";

import { useActionState } from "react";
import { LineItemsEditor, type ProductOption } from "@/components/line-items-editor";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import type { LineInput } from "@/lib/totals";

/** A header field on a sales document form (customer, dates, warehouse…). */
export type DocumentField = {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  /** For type "select". */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

/**
 * Shared create/edit form for quotations, sales orders and invoices: a grid of
 * header fields, the line items editor and notes.
 */
export function DocumentForm({
  action,
  fields,
  products,
  initialLines,
  notes,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: DocumentField[];
  products: ProductOption[];
  initialLines?: LineInput[];
  notes?: string | null;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            {fields.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                htmlFor={field.name}
                required={field.required}
                hint={field.hint}
                errors={err[field.name]}
              >
                {field.type === "select" ? (
                  <Select id={field.name} name={field.name} defaultValue={field.defaultValue ?? ""} required={field.required}>
                    <option value="">{field.placeholder ?? "Select…"}</option>
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type}
                    defaultValue={field.defaultValue ?? ""}
                    required={field.required}
                    placeholder={field.placeholder}
                  />
                )}
              </Field>
            ))}
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Line items" />
        <CardBody>
          <LineItemsEditor products={products} priceField="salePrice" initialLines={initialLines} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={notes ?? ""} rows={3} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
