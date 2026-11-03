-- CreateEnum
CREATE TYPE "RdStage" AS ENUM ('IDEA', 'FEASIBILITY', 'LAB', 'PILOT', 'SCALE_UP', 'COMMERCIAL', 'ON_HOLD', 'DROPPED');

-- CreateEnum
CREATE TYPE "ExperimentResult" AS ENUM ('PENDING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PilotOutcome" AS ENUM ('APPROVED', 'REWORK', 'REJECTED');

-- CreateEnum
CREATE TYPE "SampleDirection" AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('REQUESTED', 'SENT', 'RECEIVED', 'TESTING', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "B2cOrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RTO', 'RETURNED');

-- CreateEnum
CREATE TYPE "B2cPaymentMode" AS ENUM ('PREPAID', 'COD');

-- CreateEnum
CREATE TYPE "B2cPaymentStatus" AS ENUM ('PENDING', 'PAID', 'COD_PENDING', 'COD_REMITTED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "B2cPaymentKind" AS ENUM ('PAYMENT', 'REFUND', 'COD_REMITTANCE');

-- CreateEnum
CREATE TYPE "B2cShipmentStatus" AS ENUM ('READY', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO_INITIATED', 'RTO_DELIVERED', 'LOST');

-- CreateEnum
CREATE TYPE "B2cReturnStatus" AS ENUM ('REQUESTED', 'PICKED_UP', 'RECEIVED', 'INSPECTED', 'REFUNDED', 'CLOSED', 'REJECTED');

-- CreateTable
CREATE TABLE "RdProject" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "objective" TEXT,
    "productName" TEXT,
    "customer" TEXT,
    "stage" "RdStage" NOT NULL DEFAULT 'IDEA',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "ownerId" TEXT,
    "startDate" DATE,
    "targetDate" DATE,
    "budget" DECIMAL(14,2),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdExperiment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT,
    "procedure" TEXT,
    "observations" TEXT,
    "result" "ExperimentResult" NOT NULL DEFAULT 'PENDING',
    "conductedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RdExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotRun" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT,
    "productName" TEXT NOT NULL,
    "scaleKg" DECIMAL(14,3),
    "site" TEXT,
    "customer" TEXT,
    "plannedDate" DATE,
    "actualDate" DATE,
    "status" "PilotStatus" NOT NULL DEFAULT 'PLANNED',
    "outcome" "PilotOutcome",
    "yieldPct" DECIMAL(6,2),
    "costTotal" DECIMAL(14,2),
    "observations" TEXT,
    "decision" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcSample" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "direction" "SampleDirection" NOT NULL,
    "sampleType" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "batchNo" TEXT,
    "qty" DECIMAL(12,3),
    "uom" TEXT DEFAULT 'g',
    "party" TEXT,
    "jobNo" TEXT,
    "requestedBy" TEXT,
    "requestedOn" DATE NOT NULL,
    "sentOn" DATE,
    "receivedOn" DATE,
    "courier" TEXT,
    "awb" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'REQUESTED',
    "resultSummary" TEXT,
    "retentionUntil" DATE,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcTest" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "specification" TEXT,
    "method" TEXT,
    "result" TEXT,
    "unit" TEXT,
    "pass" BOOLEAN,
    "testedOn" DATE,
    "testedBy" TEXT,
    "lab" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QcTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "authority" TEXT,
    "branchId" TEXT,
    "state" TEXT,
    "scope" TEXT,
    "issuedOn" DATE,
    "validUntil" DATE,
    "renewalLeadDays" INTEGER NOT NULL DEFAULT 60,
    "renewalStatus" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productName" TEXT,
    "batchNo" TEXT,
    "jobNo" TEXT,
    "party" TEXT,
    "issuer" TEXT,
    "issuedOn" DATE,
    "validUntil" DATE,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cCustomer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addresses" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[],
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2cCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "channelOrderRef" TEXT,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "B2cOrderStatus" NOT NULL DEFAULT 'PLACED',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "paymentMode" "B2cPaymentMode" NOT NULL DEFAULT 'PREPAID',
    "paymentStatus" "B2cPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "shipName" TEXT,
    "shipPhone" TEXT,
    "shipLine1" TEXT,
    "shipLine2" TEXT,
    "shipCity" TEXT,
    "shipState" TEXT,
    "shipPincode" TEXT,
    "warehouseId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippingCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2cOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "shippedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "B2cOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "B2cPaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "method" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "gatewayRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Success',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2cPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cShipment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courier" TEXT,
    "awb" TEXT,
    "trackingUrl" TEXT,
    "status" "B2cShipmentStatus" NOT NULL DEFAULT 'READY',
    "weightKg" DECIMAL(10,3),
    "charges" DECIMAL(12,2),
    "codAmount" DECIMAL(14,2),
    "shippedOn" TIMESTAMP(3),
    "deliveredOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2cShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2cReturn" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUSTOMER_RETURN',
    "reason" TEXT,
    "status" "B2cReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2cReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RdProject_code_key" ON "RdProject"("code");

-- CreateIndex
CREATE INDEX "RdProject_stage_idx" ON "RdProject"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "RdExperiment_code_key" ON "RdExperiment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PilotRun_code_key" ON "PilotRun"("code");

-- CreateIndex
CREATE INDEX "PilotRun_status_idx" ON "PilotRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QcSample_code_key" ON "QcSample"("code");

-- CreateIndex
CREATE INDEX "QcSample_status_idx" ON "QcSample"("status");

-- CreateIndex
CREATE UNIQUE INDEX "License_code_key" ON "License"("code");

-- CreateIndex
CREATE INDEX "License_validUntil_idx" ON "License"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_code_key" ON "Certificate"("code");

-- CreateIndex
CREATE INDEX "Certificate_kind_idx" ON "Certificate"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "B2cCustomer_code_key" ON "B2cCustomer"("code");

-- CreateIndex
CREATE INDEX "B2cCustomer_phone_idx" ON "B2cCustomer"("phone");

-- CreateIndex
CREATE INDEX "B2cCustomer_name_idx" ON "B2cCustomer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "B2cOrder_number_key" ON "B2cOrder"("number");

-- CreateIndex
CREATE INDEX "B2cOrder_status_idx" ON "B2cOrder"("status");

-- CreateIndex
CREATE INDEX "B2cOrder_orderDate_idx" ON "B2cOrder"("orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "B2cShipment_number_key" ON "B2cShipment"("number");

-- CreateIndex
CREATE INDEX "B2cShipment_status_idx" ON "B2cShipment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "B2cReturn_number_key" ON "B2cReturn"("number");

-- CreateIndex
CREATE INDEX "B2cReturn_status_idx" ON "B2cReturn"("status");

-- AddForeignKey
ALTER TABLE "RdProject" ADD CONSTRAINT "RdProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdExperiment" ADD CONSTRAINT "RdExperiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RdProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotRun" ADD CONSTRAINT "PilotRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RdProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcTest" ADD CONSTRAINT "QcTest_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "QcSample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cOrder" ADD CONSTRAINT "B2cOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "B2cCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cOrder" ADD CONSTRAINT "B2cOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cOrder" ADD CONSTRAINT "B2cOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cOrderLine" ADD CONSTRAINT "B2cOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2cOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cOrderLine" ADD CONSTRAINT "B2cOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cPayment" ADD CONSTRAINT "B2cPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2cOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cShipment" ADD CONSTRAINT "B2cShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2cOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2cReturn" ADD CONSTRAINT "B2cReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "B2cOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
