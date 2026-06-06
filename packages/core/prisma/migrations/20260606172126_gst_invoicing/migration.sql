-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRateBps" INTEGER,
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN',
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "taxAddressLine1" TEXT,
ADD COLUMN     "taxAddressLine2" TEXT,
ADD COLUMN     "taxCity" TEXT,
ADD COLUMN     "taxPincode" TEXT,
ADD COLUMN     "taxState" TEXT,
ADD COLUMN     "taxStateCode" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerName" TEXT NOT NULL,
    "sellerLegalName" TEXT,
    "sellerGstin" TEXT,
    "sellerPan" TEXT,
    "sellerAddress" JSONB,
    "sellerStateCode" TEXT,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "buyerGstin" TEXT,
    "buyerAddress" JSONB,
    "placeOfSupply" TEXT,
    "placeOfSupplyCode" TEXT,
    "intraState" BOOLEAN NOT NULL DEFAULT false,
    "isTaxInvoice" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxableMinor" INTEGER NOT NULL,
    "cgstMinor" INTEGER NOT NULL DEFAULT 0,
    "sgstMinor" INTEGER NOT NULL DEFAULT 0,
    "igstMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "roundOffMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxableMinor" INTEGER NOT NULL,
    "gstRateBps" INTEGER NOT NULL DEFAULT 0,
    "cgstMinor" INTEGER NOT NULL DEFAULT 0,
    "sgstMinor" INTEGER NOT NULL DEFAULT 0,
    "igstMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "returnId" TEXT,
    "number" INTEGER NOT NULL,
    "creditNoteNo" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxableMinor" INTEGER NOT NULL,
    "cgstMinor" INTEGER NOT NULL DEFAULT 0,
    "sgstMinor" INTEGER NOT NULL DEFAULT 0,
    "igstMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "intraState" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_storeId_issuedAt_idx" ON "Invoice"("storeId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_storeId_number_key" ON "Invoice"("storeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_storeId_invoiceNo_key" ON "Invoice"("storeId", "invoiceNo");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_returnId_key" ON "CreditNote"("returnId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_storeId_issuedAt_idx" ON "CreditNote"("storeId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_storeId_number_key" ON "CreditNote"("storeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_storeId_creditNoteNo_key" ON "CreditNote"("storeId", "creditNoteNo");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE SET NULL ON UPDATE CASCADE;
