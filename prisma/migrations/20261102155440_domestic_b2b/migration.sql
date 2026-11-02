-- CreateEnum
CREATE TYPE "OpsTeam" AS ENUM ('DEMAND', 'SUPPLY', 'LOGISTICS', 'SCM');

-- CreateEnum
CREATE TYPE "FreshPoBoard" AS ENUM ('FRESH', 'LONG_HOLD', 'MIS');

-- CreateEnum
CREATE TYPE "FreshPoStage" AS ENUM ('DEMAND_PENDING', 'SUPPLY_PENDING', 'LOGISTICS_PENDING', 'READY');

-- CreateEnum
CREATE TYPE "MisStatus" AS ENUM ('FRESH_PO', 'PLANNED', 'MATERIAL_READY', 'INTRANSIT', 'DELIVERED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryIssueKind" AS ENUM ('LOST_FOUND', 'DAMAGE');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'FEATURE');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "changes" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "multipleAddresses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pocNames" TEXT[];

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "aliases" TEXT[],
ADD COLUMN     "casNo" TEXT,
ADD COLUMN     "funnel" TEXT,
ADD COLUMN     "productClass" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "opsTeam" "OpsTeam";

-- CreateTable
CREATE TABLE "OpsPoc" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsPoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshPo" (
    "id" TEXT NOT NULL,
    "requestNo" INTEGER,
    "board" "FreshPoBoard" NOT NULL DEFAULT 'FRESH',
    "stage" "FreshPoStage" NOT NULL DEFAULT 'DEMAND_PENDING',
    "customer" TEXT,
    "demandPoc" TEXT,
    "poDate" DATE,
    "product" TEXT,
    "productType" TEXT,
    "poQty" DECIMAL(14,3),
    "qtyToDispatch" DECIMAL(14,3),
    "rate" DECIMAL(14,2),
    "totalTaxable" DECIMAL(16,2),
    "paymentTerms" TEXT,
    "paymentReceived" TEXT,
    "customerType" TEXT,
    "customerPoc" TEXT,
    "scmContactCustomer" TEXT,
    "deliveryAddress" TEXT,
    "logisticsPaymentTerm" TEXT,
    "cxLogisticsPoc" TEXT,
    "logisticsType" TEXT,
    "scmToDispatch" TEXT,
    "businessLeg" TEXT DEFAULT 'B2B',
    "notes" TEXT,
    "agSupplyPoc" TEXT,
    "supplier" TEXT,
    "supplyPoc" TEXT,
    "pickupAddress" TEXT,
    "hsnCode" TEXT,
    "packaging" TEXT,
    "originType" TEXT,
    "batchNo" TEXT,
    "movementType" TEXT DEFAULT 'Forward',
    "verifiedBy" TEXT,
    "holdReleasedAt" DATE,
    "misJobId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreshPo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MisJob" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "status" "MisStatus",
    "source" TEXT NOT NULL DEFAULT 'manual',
    "poDate" DATE,
    "supplier" TEXT,
    "customer" TEXT,
    "productName" TEXT,
    "quantityKgs" DECIMAL(14,3),
    "batchNo" TEXT,
    "grossWtKg" DECIMAL(14,3),
    "packing" TEXT,
    "unitCount" TEXT,
    "hsCode" TEXT,
    "plannedEtd" DATE,
    "plannedEta" DATE,
    "cxQuoteApprovalTime" TIMESTAMP(3),
    "sxReadinessTime" TIMESTAMP(3),
    "actualEtd" DATE,
    "actualEta" DATE,
    "logisticsPoc" TEXT,
    "agSupplyPoc" TEXT,
    "agDemandPoc" TEXT,
    "supplyPoc" TEXT,
    "customerPocDetails" TEXT,
    "pickupAddress" TEXT,
    "pickupPincode" TEXT,
    "dropAddress" TEXT,
    "dropPincode" TEXT,
    "logisticsType" TEXT,
    "vehicleType" TEXT,
    "transporterDetails" TEXT,
    "totalLogisticsCost" DECIMAL(14,2),
    "logisticsCostAgToPay" DECIMAL(14,2),
    "logisticsPaymentTerm" TEXT,
    "originType" TEXT,
    "destinationType" TEXT,
    "distanceApprox" DECIMAL(10,1),
    "movementType" TEXT,
    "taxableValue" DECIMAL(16,2),
    "taxInvoiceMonth" TEXT,
    "taxInvoicedDate" DATE,
    "transportPaymentStatus" TEXT,
    "transportPaidSoFar" DECIMAL(14,2),
    "transportPaidOn" DATE,
    "transportPaymentRef" TEXT,
    "blockersRemarks" TEXT,
    "planningActionables" TEXT,
    "cxSxAlignmentTime" TEXT,
    "statusConfirmedDate" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsFile" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "url" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchQuote" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "plannedFor" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'planned-today',
    "customer" TEXT,
    "supplier" TEXT,
    "distance" TEXT,
    "pickupAddress" TEXT,
    "deliveryAddress" TEXT,
    "netWeight" TEXT,
    "grossWt" TEXT,
    "packing" TEXT,
    "taxableValue" TEXT,
    "paymentTerms" TEXT,
    "agDemandPoc" TEXT,
    "materialReadiness" TEXT,
    "materialReadyTime" TEXT,
    "vehicleStatus" TEXT,
    "vehicleStages" TEXT[],
    "vehicleArrangements" TEXT,
    "vehicleDetails" TEXT,
    "vehicleType" TEXT,
    "approvedTx" TEXT,
    "bids" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchInward" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT,
    "inwardDate" DATE,
    "location" TEXT NOT NULL,
    "funnel" TEXT,
    "supplyPoc" TEXT,
    "grnNo" TEXT,
    "manufacturer" TEXT,
    "supplier" TEXT,
    "productName" TEXT NOT NULL,
    "catalogueName" TEXT,
    "type" TEXT,
    "hsn" TEXT,
    "batchNo" TEXT,
    "units" DECIMAL(14,3),
    "packaging" TEXT,
    "uom" TEXT,
    "netWeight" DECIMAL(14,3) NOT NULL,
    "grossWeight" DECIMAL(14,3),
    "mfgDate" DATE,
    "expDate" DATE,
    "purchaseRate" DECIMAL(14,2),
    "remarks" TEXT,
    "sheetOutwardQty" DECIMAL(14,3),
    "license" TEXT,
    "lineKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchInward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchOutward" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'crm',
    "jobNo" TEXT,
    "obDate" DATE,
    "warehouse" TEXT,
    "funnel" TEXT,
    "customer" TEXT,
    "grnNo" TEXT,
    "productName" TEXT NOT NULL,
    "catalogueName" TEXT,
    "batchNo" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "saleRate" DECIMAL(14,2),
    "outKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchOutward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryIssue" (
    "id" TEXT NOT NULL,
    "kind" "InventoryIssueKind" NOT NULL,
    "date" DATE,
    "status" TEXT,
    "jobNo" TEXT,
    "productName" TEXT,
    "batchNo" TEXT,
    "qtyKg" DECIMAL(14,3),
    "data" JSONB NOT NULL DEFAULT '{}',
    "entryKey" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseCount" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "countDate" DATE,
    "rows" JSONB NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "page" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'New',
    "reply" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpsPoc_name_key" ON "OpsPoc"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FreshPo_misJobId_key" ON "FreshPo"("misJobId");

-- CreateIndex
CREATE INDEX "FreshPo_board_deletedAt_idx" ON "FreshPo"("board", "deletedAt");

-- CreateIndex
CREATE INDEX "FreshPo_stage_idx" ON "FreshPo"("stage");

-- CreateIndex
CREATE INDEX "MisJob_jobNo_idx" ON "MisJob"("jobNo");

-- CreateIndex
CREATE INDEX "MisJob_deletedAt_status_idx" ON "MisJob"("deletedAt", "status");

-- CreateIndex
CREATE INDEX "OpsFile_entityType_entityId_idx" ON "OpsFile"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchQuote_jobNo_plannedFor_key" ON "DispatchQuote"("jobNo", "plannedFor");

-- CreateIndex
CREATE INDEX "BatchInward_deletedAt_idx" ON "BatchInward"("deletedAt");

-- CreateIndex
CREATE INDEX "BatchInward_batchNo_idx" ON "BatchInward"("batchNo");

-- CreateIndex
CREATE INDEX "BatchInward_lineKey_idx" ON "BatchInward"("lineKey");

-- CreateIndex
CREATE INDEX "BatchOutward_deletedAt_idx" ON "BatchOutward"("deletedAt");

-- CreateIndex
CREATE INDEX "BatchOutward_batchNo_idx" ON "BatchOutward"("batchNo");

-- CreateIndex
CREATE INDEX "BatchOutward_outKey_idx" ON "BatchOutward"("outKey");

-- CreateIndex
CREATE INDEX "InventoryIssue_kind_deletedAt_idx" ON "InventoryIssue"("kind", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCount_kind_key" ON "WarehouseCount"("kind");

-- AddForeignKey
ALTER TABLE "FreshPo" ADD CONSTRAINT "FreshPo_misJobId_fkey" FOREIGN KEY ("misJobId") REFERENCES "MisJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
