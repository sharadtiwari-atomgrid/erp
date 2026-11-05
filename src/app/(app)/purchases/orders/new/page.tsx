import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { getProductOptions, getWarehouseOptions } from "@/lib/options";
import { DocumentForm } from "../../sales/_components/document-form";
import { toOptions } from "../../sales/_lib/documents";
import { createPurchaseOrder } from "../actions";
import { db } from "@/lib/db";

export const instant = false;
export const metadata: Metadata = { title: "New Purchase Order" };

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchases/orders/new">) {
  await requireUser("finance", "edit");
  const sp = await searchParams;
  const [suppliers, warehouses, products] = await Promise.all([
    db.contact.findMany({ where: { roles: { has: "SUPPLIER" }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    getWarehouseOptions(),
    getProductOptions(),
  ]);
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.code + " — " + s.name }));
  return <div className="max-w-7xl">
    <PageHeader title="New Purchase Order" back={{ href: "/purchases/orders", label: "Purchase Orders" }} />
    <DocumentForm action={createPurchaseOrder} products={products} priceField="purchasePrice" cancelHref="/purchases/orders" submitLabel="Save Purchase Order"
      fields={[
        { name: "supplierId", label: "Buy-from Vendor", type: "select", required: true, options: supplierOptions, defaultValue: param(sp, "supplierId"), placeholder: "Select a vendor…" },
        { name: "warehouseId", label: "Location Code", type: "select", required: true, options: toOptions(warehouses), defaultValue: warehouses[0]?.id, placeholder: "Select a location…" },
        { name: "orderDate", label: "Order Date", type: "date", required: true, defaultValue: toDateInput(new Date()) },
        { name: "postingDate", label: "Posting Date", type: "date", defaultValue: toDateInput(new Date()) },
        { name: "expectedReceiptDate", label: "Expected Receipt Date", type: "date" },
        { name: "vendorOrderNo", label: "Vendor Order No.", type: "text" },
        { name: "payToVendorId", label: "Pay-to Vendor", type: "select", options: supplierOptions, placeholder: "Same as buy-from…" },
        { name: "paymentTermsCode", label: "Payment Terms Code", type: "text" },
        { name: "paymentMethodCode", label: "Payment Method Code", type: "text" },
        { name: "shipmentMethodCode", label: "Shipment Method Code", type: "text" },
        { name: "currencyCode", label: "Currency Code", type: "text", defaultValue: "INR" },
        { name: "externalDocumentNo", label: "External Document No.", type: "text" },
        { name: "purchaserCode", label: "Purchaser Code", type: "text" },
        { name: "postingDescription", label: "Posting Description", type: "text" },
        { name: "shipToCode", label: "Ship-to Code", type: "text" },
        { name: "shipToName", label: "Ship-to Name", type: "text" },
        { name: "shipToAddress", label: "Ship-to Address", type: "text" },
        { name: "shipToCity", label: "Ship-to City", type: "text" },
        { name: "shipToState", label: "Ship-to State", type: "text" },
        { name: "shipToPincode", label: "Ship-to Post Code", type: "text" },
      ]}
    />
  </div>;
}
