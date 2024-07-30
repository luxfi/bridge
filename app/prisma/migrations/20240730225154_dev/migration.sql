/*
  Warnings:

  - Added the required column `block_number` to the `Swap` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Swap" ADD COLUMN     "block_number" INTEGER NOT NULL;
