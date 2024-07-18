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
    "sourceAddress" TEXT NOT NULL,
    "requestedAmount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "failReason" TEXT,
    "metadataSequenceNumber" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Swap" ("createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress") SELECT "createdDate", "destinationAddress", "destinationNetworkName", "destinationTokenSymbol", "failReason", "id", "isDeleted", "metadataSequenceNumber", "refuel", "requestedAmount", "sourceAddress", "sourceNetworkName", "sourceTokenSymbol", "status", "useDepositAddress" FROM "Swap";
DROP TABLE "Swap";
ALTER TABLE "new_Swap" RENAME TO "Swap";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
