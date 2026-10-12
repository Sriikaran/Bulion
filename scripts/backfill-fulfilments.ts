import "dotenv/config";
import { prisma } from "../src/lib/db/client";

export async function backfillHistoricalFulfilments() {
  console.log("Checking historical transactions for fulfilment backfill...");

  // 1. Backfill Purchases that already have physical StockMovements
  const purchases = await prisma.purchase.findMany({
    where: {
      status: "POSTED",
      fulfilmentStatus: "PENDING",
      stockMovements: {
        some: {
          movementType: "PURCHASE",
          fulfilmentId: null,
        },
      },
    },
    include: {
      stockMovements: {
        where: { movementType: "PURCHASE", fulfilmentId: null },
      },
    },
  });

  console.log(`Found ${purchases.length} posted purchases with legacy StockMovements`);

  for (const p of purchases) {
    for (let i = 0; i < p.stockMovements.length; i++) {
      const sm = p.stockMovements[i];
      const fulfilmentNumber = `FUL-${p.invoiceNumber}-${i + 1}`;
      const f = await prisma.fulfilment.create({
        data: {
          fulfilmentNumber,
          type: "PURCHASE",
          status: "FULFILLED",
          purchaseId: p.id,
          weightGrams: sm.weightGrams,
          fulfilledAt: sm.createdAt,
          fulfilledById: sm.createdById,
          notes: "Legacy V1/V2 transaction fulfilment backfill",
        },
      });

      await prisma.stockMovement.update({
        where: { id: sm.id },
        data: { fulfilmentId: f.id },
      });
    }

    await prisma.purchase.update({
      where: { id: p.id },
      data: { fulfilmentStatus: "FULFILLED" },
    });
  }

  // 2. Backfill Sales that already have physical StockMovements
  const sales = await prisma.sale.findMany({
    where: {
      status: "POSTED",
      fulfilmentStatus: "PENDING",
      stockMovements: {
        some: {
          movementType: "SALE",
          fulfilmentId: null,
        },
      },
    },
    include: {
      stockMovements: {
        where: { movementType: "SALE", fulfilmentId: null },
      },
    },
  });

  console.log(`Found ${sales.length} posted sales with legacy StockMovements`);

  for (const s of sales) {
    for (let i = 0; i < s.stockMovements.length; i++) {
      const sm = s.stockMovements[i];
      const fulfilmentNumber = `FUL-${s.invoiceNumber}-${i + 1}`;
      const f = await prisma.fulfilment.create({
        data: {
          fulfilmentNumber,
          type: "SALE",
          status: "FULFILLED",
          saleId: s.id,
          weightGrams: sm.weightGrams.abs(), // absolute weight for fulfilment record
          fulfilledAt: sm.createdAt,
          fulfilledById: sm.createdById,
          notes: "Legacy V1/V2 transaction fulfilment backfill",
        },
      });

      await prisma.stockMovement.update({
        where: { id: sm.id },
        data: { fulfilmentId: f.id },
      });
    }

    await prisma.sale.update({
      where: { id: s.id },
      data: { fulfilmentStatus: "FULFILLED" },
    });
  }

  // 3. Update any CANCELLED transactions
  await prisma.purchase.updateMany({
    where: { status: "CANCELLED", fulfilmentStatus: "PENDING" },
    data: { fulfilmentStatus: "CANCELLED" },
  });

  await prisma.sale.updateMany({
    where: { status: "CANCELLED", fulfilmentStatus: "PENDING" },
    data: { fulfilmentStatus: "CANCELLED" },
  });

  console.log("Historical fulfilment backfill complete.");
}

if (require.main === module) {
  backfillHistoricalFulfilments()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
