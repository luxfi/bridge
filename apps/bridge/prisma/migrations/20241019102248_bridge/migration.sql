/*
  Warnings:

  - You are about to drop the column `block_number` on the `Swap` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DepositAddress" ADD COLUMN     "memo" TEXT;

-- AlterTable
ALTER TABLE "Swap" DROP COLUMN "block_number";
