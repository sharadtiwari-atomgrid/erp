"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { LineItemsEditor, type ProductOption } from "@/components/line-items-editor";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import type { LineInput } from "@/lib/totals";

export type PurchaseOrderFormValues = {
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  postingDate: string;
  expectedReceiptDate: string;
  vendorOrderNo: string;
  payToVendorId: string;
  shipToCode: string;
  shipToName: string;
  shipToAddress: string;
  shipToCity: string;
  shipToState: string;
  shipToPincode: string;
  paymentTermsCode: string;
  paymentMethodCode: string;
  shipmentMethodCode: string;
  currencyCode: string;
  externalDocumentNo: string;
  purchaserCode: string;
  postingDescription: string;
  locationCode: string;
  notes: string | null;
  lines: LineInput[];
};

type Option = { id: string; code: string; name: string };

export function PurchaseOrderForm({
  action,
  suppliers,
  warehouses,
  products,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  suppliers: Option[];
  warehouses: Option[];
  products: ProductOption[];
  initial: PurchaseOrderFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Order details" />
        <CardBody>
          <FormGrid>
            <Field label="Supplier" htmlFor="supplierId" required errors={err.supplierId}>
              <Select id="supplierId" name="supplierId" defaultValue={initial.supplierId} required>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Receiving warehouse" htmlFor="warehouseId" required errors={err.warehouseId}>
              <Select id="warehouseId" name="warehouseId" defaultValue={initial.warehouseId} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Order date" htmlFor="orderDate" required errors={err.orderDate}>
              <Input id="orderDate" name="orderDate" type="date" defaultValue={initial.orderDate} required />
            </Field>
            <Field label="Posting date" htmlFor="postingDate" errors={err.postingDate}>
              <Input id="postingDate" name="postingDate" type="date" defaultValue={initial.postingDate} />
            </Field>
            <Field label="Expected receipt date" htmlFor="expectedReceiptDate" errors={err.expectedReceiptDate}>
              <Input id="expectedReceiptDate" name="expectedReceiptDate" type="date" defaultValue={initial.expectedReceiptDate} />
            </Field>
            <Field label="Vendor order no." htmlFor="vendorOrderNo">
              <Input id="vendorOrderNo" name="vendorOrderNo" defaultValue={initial.vendorOrderNo} />
            </Field>
            <Field label="Pay-to vendor" htmlFor="payToVendorId">
              <Select id="payToVendorId" name="payToVendorId" defaultValue={initial.payToVendorId}>
                <option value="">Same as supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </Select>
            </Field>
            <Field label="Payment terms code" htmlFor="paymentTermsCode">
              <Input id="paymentTermsCode" name="paymentTermsCode" defaultValue={initial.paymentTermsCode} />
            </Field>
            <Field label="Payment method code" htmlFor="paymentMethodCode">
              <Input id="paymentMethodCode" name="paymentMethodCode" defaultValue={initial.paymentMethodCode} />
            </Field>
            <Field label="Shipment method code" htmlFor="shipmentMethodCode">
              <Input id="shipmentMethodCode" name="shipmentMethodCode" defaultValue={initial.shipmentMethodCode} />
            </Field>
            <Field label="Currency code" htmlFor="currencyCode">
              <Input id="currencyCode" name="currencyCode" defaultValue={initial.currencyCode} />
            </Field>
            <Field label="External document no." htmlFor="externalDocumentNo">
              <Input id="externalDocumentNo" name="externalDocumentNo" defaultValue={initial.externalDocumentNo} />
            </Field>
            <Field label="Purchaser code" htmlFor="purchaserCode">
              <Input id="purchaserCode" name="purchaserCode" defaultValue={initial.purchaserCode} />
            </Field>
            <Field label="Posting description" htmlFor="postingDescription">
              <Input id="postingDescription" name="postingDescription" defaultValue={initial.postingDescription} />
            </Field>
            <Field label="Location code" htmlFor="locationCode">
              <Input id="locationCode" name="locationCode" defaultValue={initial.locationCode} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ship-to" />
        <CardBody>
          <FormGrid>
            <Field label="Ship-to code" htmlFor="shipToCode"><Input id="shipToCode" name="shipToCode" defaultValue={initial.shipToCode} /></Field>
            <Field label="Ship-to name" htmlFor="shipToName"><Input id="shipToName" name="shipToName" defaultValue={initial.shipToName} /></Field>
            <Field label="Ship-to address" htmlFor="shipToAddress"><Input id="shipToAddress" name="shipToAddress" defaultValue={initial.shipToAddress} /></Field>
            <Field label="Ship-to city" htmlFor="shipToCity"><Input id="shipToCity" name="shipToCity" defaultValue={initial.shipToCity} /></Field>
            <Field label="Ship-to state" htmlFor="shipToState"><Input id="shipToState" name="shipToState" defaultValue={initial.shipToState} /></Field>
            <Field label="Ship-to post code" htmlFor="shipToPincode"><Input id="shipToPincode" name="shipToPincode" defaultValue={initial.shipToPincode} /></Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" />
        <CardBody>
          <LineItemsEditor products={products} priceField="purchasePrice" initialLines={initial.lines} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial.notes ?? ""} rows={3} placeholder="Delivery instructions, terms…" />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save purchase order</SubmitButton>
      </div>
    </form>
  );
}
