import { prisma } from "@/prisma-instance"

const main = async () => {
  try {
    const arvs = process.argv.slice(2)
    const swapId = arvs[0]
    if (swapId) {
      await prisma.depositAction.deleteMany({
        where: { swap_id: swapId }
      })
      // Delete related Transactions
      await prisma.transaction.deleteMany({
        where: { swap_id: swapId }
      })
      // Delete related Quote
      await prisma.quote.deleteMany({
        where: { swap_id: swapId }
      })
      // Finally, delete the Swap
      const deletedSwap = await prisma.swap.delete({
        where: { id: swapId }
      })
    }
  } catch (err) {
    //
  }
}

main()
