import { prisma } from '@/lib/prisma';
import { sendTelegramAlert } from '@/lib/telegram';

const MIN_MARGIN_PERCENT = parseFloat(process.env.MIN_MARGIN_PERCENT ?? '15');

export async function runAlertEngine(): Promise<number> {
  console.log('[AlertEngine] Analizando márgenes...');
  let alertsCreated = 0;

  // Obtener últimos listings de mayoristas con producto asignado
  const mayoristListings = await prisma.rawListing.findMany({
    where: {
      provider: { type: 'MAYORISTA' },
      productId: { not: null },
      inStock: true,
    },
    include: { product: true, provider: true },
    orderBy: { scrapedAt: 'desc' },
  });

  for (const mayListing of mayoristListings) {
    if (!mayListing.productId) continue;

    // Buscar equivalente minorista más reciente
    const minListing = await prisma.rawListing.findFirst({
      where: {
        productId: mayListing.productId,
        provider: { type: 'MINORISTA' },
        inStock: true,
      },
      include: { provider: true },
      orderBy: { scrapedAt: 'desc' },
    });

    if (!minListing) continue;

    const margin =
      ((minListing.price - mayListing.price) / mayListing.price) * 100;

    if (margin >= MIN_MARGIN_PERCENT) {
      // Evitar duplicar alertas en las últimas 6 horas
      const recentAlert = await prisma.alert.findFirst({
        where: {
          productId: mayListing.productId,
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });

      if (recentAlert) continue;

      const alert = await prisma.alert.create({
        data: {
          productId: mayListing.productId,
          mayoristPrice: mayListing.price,
          minoristaPrice: minListing.price,
          marginPercent: Math.round(margin * 100) / 100,
          mayoristId: mayListing.providerId,
          minoristaId: minListing.providerId,
        },
      });

      await sendTelegramAlert(
        alert,
        { ...mayListing, product: mayListing.product },
        minListing
      );

      alertsCreated++;
    }
  }

  console.log(`[AlertEngine] ${alertsCreated} alertas creadas`);
  return alertsCreated;
}
