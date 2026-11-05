"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type BankAccountFormValues = {
  name: string;
  kind: string;
  bankName: string | null;
  accountNo: string | null;
  ifsc: string | null;
  branchName: string | null;
  isActive: boolean;
};

export function BankAccountForm({
  action,
  initial,
  cancelHref,
  glAccount,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: BankAccountFormValues;
  cancelHref: string;
  /** Linked ledger account, shown when editing. */
  glAccount?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const editing = !!initial;

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader
          title="Account"
          description={
            editing
              ? `Posts to ledger account ${glAccount ?? ""}.`
              : "A new ledger account is created for it under 1440 Bank accounts (or next to Cash in hand for a cash account)."
          }
        />
        <CardBody>
          <FormGrid>
            <Field label="Name" htmlFor="name" required errors={err.name} hint="e.g. Current account – Mumbai">
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            {editing ? (
              <input type="hidden" name="kind" value={initial.kind} />
            ) : (
              <Field label="Type" htmlFor="kind" errors={err.kind}>
                <Select id="kind" name="kind" defaultValue="BANK">
                  <option value="BANK">Bank account</option>
                  <option value="CASH">Cash / petty cash</option>
                </Select>
              </Field>
            )}
            <Field label="Bank name" htmlFor="bankName" errors={err.bankName}>
              <Input id="bankName" name="bankName" defaultValue={initial?.bankName ?? ""} />
            </Field>
            <Field label="Account No." htmlFor="accountNo" errors={err.accountNo}>
              <Input id="accountNo" name="accountNo" defaultValue={initial?.accountNo ?? ""} />
            </Field>
            <Field label="IFSC" htmlFor="ifsc" errors={err.ifsc} hint="11 characters">
              <Input id="ifsc" name="ifsc" defaultValue={initial?.ifsc ?? ""} maxLength={11} className="uppercase" />
            </Field>
            <Field label="Bank branch" htmlFor="branchName" errors={err.branchName}>
              <Input id="branchName" name="branchName" defaultValue={initial?.branchName ?? ""} />
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
        <SubmitButton>{editing ? "Save account" : "Create account"}</SubmitButton>
      </div>
    </form>
  );
}
