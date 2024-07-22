-- CreateTable
CREATE TABLE "SwapUserInfo" (
    "_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "destinationAddress" TEXT,
    "destinationNetwork" TEXT,
    "destinationToken" TEXT,
    "refuel" BOOLEAN NOT NULL DEFAULT false,
    "sourceAddress" TEXT,
    "sourceNetwork" TEXT,
    "sourceToken" TEXT,
    "useDepositAddress" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapUserInfo_pkey" PRIMARY KEY ("_id")
);

-- CreateTable
CREATE TABLE "Network" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "nodeUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "transactionExplorerTemplate" TEXT NOT NULL,
    "accountExplorerTemplate" TEXT NOT NULL,
    "listingDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "contract" TEXT,
    "decimals" INTEGER NOT NULL,
    "priceInUsd" DOUBLE PRECISION NOT NULL,
    "precision" INTEGER NOT NULL,
    "listingDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAction" (
    "id" SERIAL NOT NULL,
    "type" TEXT DEFAULT 'transfer',
    "toAddress" TEXT,
    "amount" DOUBLE PRECISION,
    "orderNumber" INTEGER,
    "amountInBaseUnits" TEXT,
    "networkId" INTEGER NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "feeTokenId" INTEGER NOT NULL,
    "callData" TEXT,
    "swap_id" TEXT NOT NULL,

    CONSTRAINT "DepositAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swap" (
    "id" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceNetworkName" TEXT NOT NULL,
    "destinationNetworkName" TEXT NOT NULL,
    "sourceTokenSymbol" TEXT NOT NULL,
    "destinationTokenSymbol" TEXT NOT NULL,
    "destinationAddress" TEXT NOT NULL,
    "refuel" BOOLEAN NOT NULL,
    "useDepositAddress" BOOLEAN NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "sourceAddress" TEXT NOT NULL,
    "requestedAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "failReason" TEXT,
    "metadataSequenceNumber" INTEGER,

    CONSTRAINT "Swap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAddress" (
    "swap_id" TEXT,
    "id" SERIAL NOT NULL,
    "address" TEXT,
    "name" TEXT,

    CONSTRAINT "ContractAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "swap_id" TEXT NOT NULL,
    "receiveAmount" DOUBLE PRECISION NOT NULL,
    "minReceiveAmount" DOUBLE PRECISION NOT NULL,
    "blockchainFee" DOUBLE PRECISION NOT NULL,
    "serviceFee" DOUBLE PRECISION NOT NULL,
    "avgCompletionTime" TEXT NOT NULL,
    "slippage" DOUBLE PRECISION NOT NULL,
    "totalFee" DOUBLE PRECISION NOT NULL,
    "totalFeeInUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SwapUserInfo__id_key" ON "SwapUserInfo"("_id");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_tokenId_key" ON "DepositAction"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_feeTokenId_key" ON "DepositAction"("feeTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAction_swap_id_key" ON "DepositAction"("swap_id");

-- CreateIndex
CREATE INDEX "DepositAction_swap_id_idx" ON "DepositAction"("swap_id");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAddress_swap_id_key" ON "ContractAddress"("swap_id");

-- AddForeignKey
ALTER TABLE "DepositAction" ADD CONSTRAINT "DepositAction_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAction" ADD CONSTRAINT "DepositAction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAction" ADD CONSTRAINT "DepositAction_feeTokenId_fkey" FOREIGN KEY ("feeTokenId") REFERENCES "Token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAction" ADD CONSTRAINT "DepositAction_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAddress" ADD CONSTRAINT "ContractAddress_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "Swap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
