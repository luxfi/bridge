-- CreateTable
CREATE TABLE "SwapUserInfo" (
    "_id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL,
    "source_network" TEXT,
    "source_exchange" TEXT,
    "source_asset" TEXT,
    "source_address" TEXT,
    "destination_network" TEXT,
    "destination_exchange" TEXT,
    "destination_asset" TEXT,
    "destination_address" TEXT,
    "refuel" BOOLEAN NOT NULL DEFAULT false,
    "use_deposit_address" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Network" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "display_name" TEXT,
    "logo" TEXT,
    "chain_id" TEXT,
    "node_url" TEXT,
    "type" TEXT,
    "transaction_explorer_template" TEXT,
    "account_explorer_template" TEXT,
    "listing_date" DATETIME,
    "token_id" INTEGER,
    "transaction_id" INTEGER,
    CONSTRAINT "Network_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Token" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "contract" TEXT,
    "decimals" INTEGER NOT NULL,
    "price_in_usd" REAL NOT NULL,
    "precision" INTEGER NOT NULL,
    "listing_date" DATETIME,
    "transaction_id" INTEGER
);

-- CreateTable
CREATE TABLE "DepositAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT DEFAULT 'transfer',
    "to_address" TEXT,
    "amount" REAL,
    "order_number" INTEGER,
    "amount_in_base_units" TEXT,
    "network_id" INTEGER NOT NULL,
    "token_id" INTEGER NOT NULL,
    "fee_token_id" INTEGER NOT NULL,
    "call_data" TEXT,
    "swap_id" TEXT NOT NULL,
    CONSTRAINT "DepositAction_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "Network" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_fee_token_id_fkey" FOREIGN KEY ("fee_token_id") REFERENCES "Token" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DepositAction_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Swap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_network" TEXT NOT NULL,
    "source_exchange" TEXT,
    "source_asset" TEXT NOT NULL,
    "source_address" TEXT NOT NULL,
    "destination_network" TEXT NOT NULL,
    "destination_exchange" TEXT,
    "destination_asset" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "refuel" BOOLEAN NOT NULL,
    "use_deposit_address" BOOLEAN NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "requested_amount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "fail_reason" TEXT,
    "metadata_sequence_number" INTEGER
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "created_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transaction_hash" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL,
    "max_confirmations" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "token_id" INTEGER,
    "network_id" INTEGER,
    "swap_id" TEXT,
    CONSTRAINT "Transaction_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "Network" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractAddress" (
    "swap_id" TEXT,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT,
    "name" TEXT,
    CONSTRAINT "ContractAddress_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "swap_id" TEXT NOT NULL,
    "receive_amount" REAL NOT NULL,
    "min_receive_amount" REAL NOT NULL,
    "blockchain_fee" REAL NOT NULL,
    "service_fee" REAL NOT NULL,
    "avg_completion_time" TEXT NOT NULL,
    "slippage" REAL NOT NULL,
    "total_fee" REAL NOT NULL,
    "total_fee_in_usd" REAL NOT NULL,
    CONSTRAINT "Quote_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SwapUserInfo__id_key" ON "SwapUserInfo"("_id");

-- CreateIndex
CREATE UNIQUE INDEX "Network_token_id_key" ON "Network"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "Network_transaction_id_key" ON "Network"("transaction_id");

-- CreateIndex
CREATE INDEX "Network_transaction_id_idx" ON "Network"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "Token_transaction_id_key" ON "Token"("transaction_id");

-- CreateIndex
CREATE INDEX "Token_transaction_id_idx" ON "Token"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_token_id_key" ON "DepositAction"("token_id");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_fee_token_id_key" ON "DepositAction"("fee_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_swap_id_key" ON "DepositAction"("swap_id");

-- CreateIndex
CREATE INDEX "DepositAction_swap_id_idx" ON "DepositAction"("swap_id");

-- CreateIndex
CREATE INDEX "Swap_id_idx" ON "Swap"("id");

-- CreateIndex
CREATE INDEX "Transaction_swap_id_idx" ON "Transaction"("swap_id");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_transaction_hash_idx" ON "Transaction"("transaction_hash");

-- CreateIndex
CREATE INDEX "Transaction_token_id_idx" ON "Transaction"("token_id");

-- CreateIndex
CREATE INDEX "Transaction_network_id_idx" ON "Transaction"("network_id");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAddress_swap_id_key" ON "ContractAddress"("swap_id");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_swap_id_key" ON "Quote"("swap_id");
