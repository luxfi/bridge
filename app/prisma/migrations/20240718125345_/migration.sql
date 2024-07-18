/*
  Warnings:

  - Added the required column `contractAddressID` to the `Swap` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ContractAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "swap_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "metadataSequenceNumber" INTEGER,
    "contractAddressID" INTEGER NOT NULL,
    CONSTRAINT "Swap_contractAddressID_fkey" FOREIGN KEY ("contractAddressID") REFERENCES "ContractAddress" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Swap" ("createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress") SELECT "createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress" FROM "Swap";
DROP TABLE "Swap";
ALTER TABLE "new_Swap" RENAME TO "Swap";
CREATE UNIQUE INDEX "Swap_contractAddressID_key" ON "Swap"("contractAddressID");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ContractAddress_swap_id_key" ON "ContractAddress"("swap_id");
