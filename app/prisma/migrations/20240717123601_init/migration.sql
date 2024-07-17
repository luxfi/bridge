-- CreateTable
CREATE TABLE "SwapUserInfo" (
    "_id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL,
    "destinationAddress" TEXT,
    "destinationNetwork" TEXT,
    "destinationToken" TEXT,
    "refuel" BOOLEAN NOT NULL DEFAULT false,
    "sourceAddress" TEXT,
    "sourceNetwork" TEXT,
    "sourceToken" TEXT,
    "useDepositAddress" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Network" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "nodeUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "transactionExplorerTemplate" TEXT NOT NULL,
    "accountExplorerTemplate" TEXT NOT NULL,
    "listingDate" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Token" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "contract" TEXT,
    "decimals" INTEGER NOT NULL,
    "priceInUsd" REAL NOT NULL,
    "precision" INTEGER NOT NULL,
    "listingDate" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DepositAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL DEFAULT 'transfer',
    "toAddress" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "amountInBaseUnits" TEXT NOT NULL,
    "networkId" INTEGER NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "feeTokenId" INTEGER NOT NULL,
    "callData" TEXT NOT NULL,
    "swap_id" TEXT NOT NULL,
    CONSTRAINT "DepositAction_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_feeTokenId_fkey" FOREIGN KEY ("feeTokenId") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Swap" (
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
    "metadataSequenceNumber" INTEGER
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "swap_id" TEXT NOT NULL,
    "receiveAmount" REAL NOT NULL,
    "minReceiveAmount" REAL NOT NULL,
    "blockchainFee" REAL NOT NULL,
    "serviceFee" REAL NOT NULL,
    "avgCompletionTime" TEXT NOT NULL,
    "slippage" REAL NOT NULL,
    "totalFee" REAL NOT NULL,
    "totalFeeInUsd" REAL NOT NULL,
    CONSTRAINT "Quote_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SwapUserInfo__id_key" ON "SwapUserInfo"("_id");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_tokenId_key" ON "DepositAction"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_feeTokenId_key" ON "DepositAction"("feeTokenId");
