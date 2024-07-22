/*
  Warnings:

  - A unique constraint covering the columns `[tokenId]` on the table `Network` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionId]` on the table `Network` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionId]` on the table `Token` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Network" ADD COLUMN     "tokenId" INTEGER,
ADD COLUMN     "transactionId" INTEGER,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "displayName" DROP NOT NULL,
ALTER COLUMN "logo" DROP NOT NULL,
ALTER COLUMN "chainId" DROP NOT NULL,
ALTER COLUMN "nodeUrl" DROP NOT NULL,
ALTER COLUMN "type" DROP NOT NULL,
ALTER COLUMN "transactionExplorerTemplate" DROP NOT NULL,
ALTER COLUMN "accountExplorerTemplate" DROP NOT NULL,
ALTER COLUMN "listingDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Token" ADD COLUMN     "transactionId" INTEGER,
ALTER COLUMN "listingDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transaction_hash" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL,
    "max_confirmations" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tokenId" INTEGER,
    "networkId" INTEGER,
    "swapId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Network_tokenId_key" ON "Network"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Network_transactionId_key" ON "Network"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Token_transactionId_key" ON "Token"("transactionId");

-- AddForeignKey
ALTER TABLE "Network" ADD CONSTRAINT "Network_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_swapId_fkey" FOREIGN KEY ("swapId") REFERENCES "Swap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
