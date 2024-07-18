-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DepositAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT DEFAULT 'transfer',
    "toAddress" TEXT,
    "amount" REAL,
    "orderNumber" INTEGER,
    "amountInBaseUnits" TEXT,
    "networkId" INTEGER NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "feeTokenId" INTEGER NOT NULL,
    "callData" TEXT,
    "swap_id" TEXT NOT NULL,
    CONSTRAINT "DepositAction_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_feeTokenId_fkey" FOREIGN KEY ("feeTokenId") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DepositAction" ("amount", "amountInBaseUnits", "callData", "feeTokenId", "id", "networkId", "orderNumber", "swap_id", "toAddress", "tokenId", "type") SELECT "amount", "amountInBaseUnits", "callData", "feeTokenId", "id", "networkId", "orderNumber", "swap_id", "toAddress", "tokenId", "type" FROM "DepositAction";
DROP TABLE "DepositAction";
ALTER TABLE "new_DepositAction" RENAME TO "DepositAction";
CREATE UNIQUE INDEX "DepositAction_tokenId_key" ON "DepositAction"("tokenId");
CREATE UNIQUE INDEX "DepositAction_feeTokenId_key" ON "DepositAction"("feeTokenId");
CREATE UNIQUE INDEX "DepositAction_swap_id_key" ON "DepositAction"("swap_id");
CREATE INDEX "DepositAction_swap_id_idx" ON "DepositAction"("swap_id");
CREATE TABLE "new_Swap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceNetworkName" TEXT NOT NULL,
    "destinationNetworkName" TEXT NOT NULL,
    "sourceTokenSymbol" TEXT NOT NULL,
    "destinationTokenSymbol" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "refuel" BOOLEAN NOT NULL,
    "useDepositAddress" BOOLEAN NOT NULL,
    "sourceAddress" TEXT NOT NULL,
    "requestedAmount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "failReason" TEXT,
    "metadataSequenceNumber" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Swap" ("createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress") SELECT "createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress" FROM "Swap";
DROP TABLE "Swap";
ALTER TABLE "new_Swap" RENAME TO "Swap";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
