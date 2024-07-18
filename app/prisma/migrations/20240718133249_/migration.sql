/*
  Warnings:

  - You are about to drop the column `contractAddressID` on the `Swap` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContractAddress" (
    "swap_id" TEXT,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT,
    "name" TEXT,
    CONSTRAINT "ContractAddress_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContractAddress" ("address", "id", "name", "swap_id") SELECT "address", "id", "name", "swap_id" FROM "ContractAddress";
DROP TABLE "ContractAddress";
ALTER TABLE "new_ContractAddress" RENAME TO "ContractAddress";
CREATE UNIQUE INDEX "ContractAddress_swap_id_key" ON "ContractAddress"("swap_id");
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
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "sourceAddress" TEXT NOT NULL,
    "requestedAmount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "failReason" TEXT,
    "metadataSequenceNumber" INTEGER
);
INSERT INTO "new_Swap" ("createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress") SELECT "createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress" FROM "Swap";
DROP TABLE "Swap";
ALTER TABLE "new_Swap" RENAME TO "Swap";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
