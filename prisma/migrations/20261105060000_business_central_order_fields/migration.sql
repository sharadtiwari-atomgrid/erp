ALTER TABLE "SalesOrder"
  ADD COLUMN "postingDate" TIMESTAMP(3),
  ADD COLUMN "shipmentDate" TIMESTAMP(3),
  ADD COLUMN "billToCustomerId" TEXT,
  ADD COLUMN "shipToCode" TEXT,
  ADD COLUMN "shipToName" TEXT,
  ADD COLUMN "shipToAddress" TEXT,
  ADD COLUMN "shipToCity" TEXT,
  ADD COLUMN "shipToState" TEXT,
  ADD COLUMN "shipToPincode" TEXT,
  ADD COLUMN "paymentTermsCode" TEXT,
  ADD COLUMN "paymentMethodCode" TEXT,
  ADD COLUMN "shipmentMethodCode" TEXT,
  ADD COLUMN "currencyCode" TEXT,
  ADD COLUMN "externalDocumentNo" TEXT,
  ADD COLUMN "salespersonCode" TEXT,
  ADD COLUMN "postingDescription" TEXT,
  ADD COLUMN "locationCode" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "postingDate" TIMESTAMP(3),
  ADD COLUMN "expectedReceiptDate" TIMESTAMP(3),
  ADD COLUMN "vendorOrderNo" TEXT,
  ADD COLUMN "payToVendorId" TEXT,
  ADD COLUMN "shipToCode" TEXT,
  ADD COLUMN "shipToName" TEXT,
  ADD COLUMN "shipToAddress" TEXT,
  ADD COLUMN "shipToCity" TEXT,
  ADD COLUMN "shipToState" TEXT,
  ADD COLUMN "shipToPincode" TEXT,
  ADD COLUMN "paymentTermsCode" TEXT,
  ADD COLUMN "paymentMethodCode" TEXT,
  ADD COLUMN "shipmentMethodCode" TEXT,
  ADD COLUMN "currencyCode" TEXT,
  ADD COLUMN "externalDocumentNo" TEXT,
  ADD COLUMN "purchaserCode" TEXT,
  ADD COLUMN "postingDescription" TEXT,
  ADD COLUMN "locationCode" TEXT;

ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_billToCustomerId_fkey"
  FOREIGN KEY ("billToCustomerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_payToVendorId_fkey"
  FOREIGN KEY ("payToVendorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SalesOrder_billToCustomerId_idx" ON "SalesOrder"("billToCustomerId");
CREATE INDEX "PurchaseOrder_payToVendorId_idx" ON "PurchaseOrder"("payToVendorId");