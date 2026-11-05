import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { getCustomerOptions, getProductOptions, getWarehouseOptions } from "@/lib/options";
import { DocumentForm } from "../../_components/document-form";
import { toOptions } from "../../_lib/documents";
import { createOrder } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New sales order" };

export default async function NewSalesOrderPage({ searchParams }: PageProps<"/sales/orders/new">) {
  await requireUser("salesOrders", "edit");
  const sp = await searchParams;
  const [customers, warehouses, products] = await Promise.all([getCustomerOptions(), getWarehouseOptions(), getProductOptions()]);

  return (
    <div className="max-w-5xl">
      <PageHeader title="New sales order" back={{ href: "/sales/orders", label: "Sales orders" }} />
      <DocumentForm
        action={createOrder}
        products={products}
        cancelHref="/sales/orders"
        submitLabel="Save sales order"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: param(sp, "customerId"), placeholder: "Select a customer…" },
          { name: "warehouseId", label: "Deliver from", type: "select", required: true, options: toOptions(warehouses), defaultValue: warehouses[0]?.id, placeholder: "Select a warehouse…" },
          { name: "orderDate", label: "Order date", type: "date", required: true, defaultValue: toDateInput(new Date()) },
          { name: "postingDate", label: "Posting date", type: "date", defaultValue: toDateInput(new Date()) },
          { name: "expectedDate", label: "Expected delivery", type: "date" },
          { name: "shipmentDate", label: "Shipment date", type: "date" },
          { name: "billToCustomerId", label: "Bill-to Customer", type: "select", options: toOptions(customers), defaultValue: param(sp, "customerId"), placeholder: "Same as sell-to…" },
          { name: "paymentTermsCode", label: "Payment Terms Code", type: "text" },
          { name: "paymentMethodCode", label: "Payment Method Code", type: "text" },
          { name: "shipmentMethodCode", label: "Shipment Method Code", type: "text" },
          { name: "currencyCode", label: "Currency Code", type: "text", defaultValue: "INR" },
          { name: "externalDocumentNo", label: "External Document No.", type: "text" },
        ]}
      />
    </div>
  );
}
