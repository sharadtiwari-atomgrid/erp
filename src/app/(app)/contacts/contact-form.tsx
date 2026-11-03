"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ContactRole } from "@/generated/prisma/enums";
import type { ActionState } from "@/lib/forms";
import { CONTACT_ROLE_LABELS } from "./roles";

export type ContactFormValues = {
  name: string;
  roles: ContactRole[];
  contactPerson: string | null;
  pocNames: string[];
  multipleAddresses: boolean;
  pan: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  creditLimit: number;
  paymentTermsDays: number;
  notes: string | null;
  isActive: boolean;
};

export function ContactForm({
  action,
  initial,
  cancelHref,
  defaultRoles = ["CUSTOMER"],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ContactFormValues;
  /** Pre-ticked roles for a new contact, e.g. from ?role=SUPPLIER. */
  defaultRoles?: ContactRole[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [transporter, setTransporter] = useState((initial?.roles ?? defaultRoles).includes("TRANSPORTER"));

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Contact person" htmlFor="contactPerson" errors={err.contactPerson}>
              <Input id="contactPerson" name="contactPerson" defaultValue={initial?.contactPerson ?? ""} />
            </Field>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Roles<span className="ml-0.5 text-red-600">*</span>
              </legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="roles"
                      value={role}
                      defaultChecked={(initial?.roles ?? defaultRoles).includes(role)}
                      onChange={role === "TRANSPORTER" ? (e) => setTransporter(e.target.checked) : undefined}
                      className="h-4 w-4 rounded border-line"
                    />
                    {CONTACT_ROLE_LABELS[role]}
                  </label>
                ))}
              </div>
              {err.roles?.map((e) => (
                <p key={e} className="mt-1 text-xs text-red-600">
                  {e}
                </p>
              ))}
            </fieldset>
            <Field label="Email" htmlFor="email" errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
            </Field>
            <Field
              label={transporter ? "Transporter ID (GSTIN)" : "GSTIN"}
              htmlFor="gstin"
              errors={err.gstin}
              required={transporter}
              hint={transporter ? "Required for transporters" : "15-character GST number"}
            >
              <Input id="gstin" name="gstin" defaultValue={initial?.gstin ?? ""} maxLength={15} required={transporter} />
            </Field>
            <Field label="PAN" htmlFor="pan" errors={err.pan}>
              <Input id="pan" name="pan" defaultValue={initial?.pan ?? ""} maxLength={10} />
            </Field>
            <Field label="Payment terms (days)" htmlFor="paymentTermsDays" errors={err.paymentTermsDays}>
              <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min="0" defaultValue={initial?.paymentTermsDays ?? 30} />
            </Field>
            <Field label="Credit limit" htmlFor="creditLimit" errors={err.creditLimit} hint="0 means no limit">
              <Input id="creditLimit" name="creditLimit" type="number" min="0" step="0.01" defaultValue={initial?.creditLimit ?? 0} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active
              </label>
              {err.isActive?.map((e) => (
                <span key={e} className="ml-2 text-xs text-red-600">
                  {e}
                </span>
              ))}
            </div>
            <Field label="POC names" htmlFor="pocNames" errors={err.pocNames} hint="People at this company, one per line (used by the Domestic B2B POC pickers)">
              <Textarea id="pocNames" name="pocNames" rows={3} defaultValue={(initial?.pocNames ?? []).join("\n")} />
            </Field>
            <div className="flex items-start pt-7">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="multipleAddresses" defaultChecked={initial?.multipleAddresses ?? false} className="h-4 w-4 rounded border-line" />
                Delivers to multiple addresses (shown in Domestic MIS)
              </label>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Address" />
        <CardBody>
          <FormGrid>
            <Field label="Billing address" htmlFor="billingAddress" errors={err.billingAddress}>
              <Textarea id="billingAddress" name="billingAddress" defaultValue={initial?.billingAddress ?? ""} />
            </Field>
            <Field label="Shipping address" htmlFor="shippingAddress" errors={err.shippingAddress}>
              <Textarea id="shippingAddress" name="shippingAddress" defaultValue={initial?.shippingAddress ?? ""} />
            </Field>
            <Field label="City" htmlFor="city" errors={err.city}>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </Field>
            <Field label="State" htmlFor="state" errors={err.state} hint="Used to decide CGST/SGST vs IGST">
              <Input id="state" name="state" defaultValue={initial?.state ?? ""} />
            </Field>
            <Field label="PIN code" htmlFor="pincode" errors={err.pincode}>
              <Input id="pincode" name="pincode" defaultValue={initial?.pincode ?? ""} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial?.notes ?? ""} rows={4} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save contact</SubmitButton>
      </div>
    </form>
  );
}
