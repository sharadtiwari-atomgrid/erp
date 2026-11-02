"use client";

import { useActionState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateCompany } from "./actions";

type Company = {
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  currency: string;
};

export function CompanyForm({ initial }: { initial: Company }) {
  const [state, action] = useActionState(updateCompany, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Business details" description="Shown on quotations, invoices and purchase orders." />
        <CardBody>
          <FormGrid>
            <Field label="Display name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </Field>
            <Field label="Legal name" htmlFor="legalName" errors={err.legalName}>
              <Input id="legalName" name="legalName" defaultValue={initial.legalName ?? ""} />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" errors={err.gstin}>
              <Input id="gstin" name="gstin" defaultValue={initial.gstin ?? ""} maxLength={15} />
            </Field>
            <Field label="PAN" htmlFor="pan" errors={err.pan}>
              <Input id="pan" name="pan" defaultValue={initial.pan ?? ""} maxLength={10} />
            </Field>
            <Field label="Email" htmlFor="email" errors={err.email}>
              <Input id="email" name="email" type="email" defaultValue={initial.email ?? ""} />
            </Field>
            <Field label="Phone" htmlFor="phone" errors={err.phone}>
              <Input id="phone" name="phone" defaultValue={initial.phone ?? ""} />
            </Field>
            <Field label="Currency" htmlFor="currency" errors={err.currency} hint="ISO code, e.g. INR">
              <Input id="currency" name="currency" defaultValue={initial.currency} maxLength={3} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Registered address" />
        <CardBody>
          <FormGrid>
            <Field label="Address" htmlFor="address" errors={err.address} className="sm:col-span-2">
              <Textarea id="address" name="address" defaultValue={initial.address ?? ""} />
            </Field>
            <Field label="City" htmlFor="city" errors={err.city}>
              <Input id="city" name="city" defaultValue={initial.city ?? ""} />
            </Field>
            <Field label="State" htmlFor="state" errors={err.state} hint="Compared with place of supply for CGST/SGST vs IGST">
              <Input id="state" name="state" defaultValue={initial.state ?? ""} />
            </Field>
            <Field label="PIN code" htmlFor="pincode" errors={err.pincode}>
              <Input id="pincode" name="pincode" defaultValue={initial.pincode ?? ""} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}
