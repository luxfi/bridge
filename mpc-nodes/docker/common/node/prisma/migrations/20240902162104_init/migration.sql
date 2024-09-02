-- CreateTable
CREATE TABLE "Teleporter" (
    "id" SERIAL NOT NULL,
    "txId" TEXT NOT NULL,
    "chainType" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "hashedTxId" TEXT NOT NULL,

    CONSTRAINT "Teleporter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Teleporter_txId_key" ON "Teleporter"("txId");

-- CreateIndex
CREATE UNIQUE INDEX "Teleporter_signature_key" ON "Teleporter"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "Teleporter_hashedTxId_key" ON "Teleporter"("hashedTxId");
