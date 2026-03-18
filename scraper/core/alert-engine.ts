import { prisma } from '@/lib/prisma';
import { sendTelegramAlert } from '@/lib/telegram';
import { buildComparisonSelectionForProduct } from '@/lib/comparison';

const MIN_MARGIN_PERCENT = parseFloat(process.env.MIN_MARGIN_PERCENT ?? '15');

export async function runAlertEngine(): Promise<number> {
  console.log('[AlertEngine] Analizando márgenes...');
  let alertsCreated = 0;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      canonicalName: true,
      category: true,
      imageUrl: true,
      rawListings: {
        where: { inStock: true },
        select: {
          productId: true,
          price: true,
          currency: true,
          scrapedAt: true,
          providerId: true,
          rawName: true,
          url: true,
          provider: {
            select: {
              name: true,
              type: true,
            },
          },
        },
        orderBy: { scrapedAt: 'desc' },
      },
    },
  });

  for (const product of products) {
    const selection = buildComparisonSelectionForProduct(product as never, 'WHOLESALE_VS_RETAIL');
    if (!selection) continue;

    const { row, sourceListing, targetListing } = selection;
    const margin = row.marginPercent;

    if (margin >= MIN_MARGIN_PERCENT) {
      const recentAlert = await prisma.alert.findFirst({
        where: {
          productId: product.id,
          mayoristId: row.mayoristProviderId,
          minoristaId: row.minoristaProviderId,
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });

      if (recentAlert) continue;

      const alert = await prisma.alert.create({
        data: {
          productId: product.id,
          mayoristPrice: row.mayoristPrice,
          minoristaPrice: row.minoristaPrice,
          marginPercent: row.marginPercent,
          mayoristId: row.mayoristProviderId,
          minoristaId: row.minoristaProviderId,
        },
      });

      await sendTelegramAlert(
        alert,
        {
          ...sourceListing,
          price: row.mayoristPrice,
          url: row.mayoristUrl,
          rawName: row.mayoristRawName,
          product: {
            canonicalName: product.canonicalName,
            imageUrl: product.imageUrl,
          },
        },
        {
          ...targetListing,
          price: row.minoristaPrice,
          url: row.minoristaUrl,
          rawName: row.minoristaRawName,
          product: {
            canonicalName: product.canonicalName,
            imageUrl: product.imageUrl,
          },
        }
      );

      alertsCreated++;
    }
  }

  console.log(`[AlertEngine] ${alertsCreated} alertas creadas`);
  return alertsCreated;
}
