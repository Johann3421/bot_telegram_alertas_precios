import 'dotenv/config';

import { prisma } from '@/lib/prisma';

async function main() {
  const [totalProducts, productsWithImage, activeAlertsWithImage, totalAlerts] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({
      where: {
        imageUrl: {
          not: null,
        },
      },
    }),
    prisma.alert.count({
      where: {
        product: {
          imageUrl: {
            not: null,
          },
        },
      },
    }),
    prisma.alert.count(),
  ]);

  const percentage = totalProducts === 0 ? 0 : (productsWithImage / totalProducts) * 100;
  const alertPercentage = totalAlerts === 0 ? 0 : (activeAlertsWithImage / totalAlerts) * 100;

  console.log(JSON.stringify({
    totalProducts,
    productsWithImage,
    productImageCoveragePercent: Number(percentage.toFixed(2)),
    totalAlerts,
    alertsWithProductImage: activeAlertsWithImage,
    alertImageCoveragePercent: Number(alertPercentage.toFixed(2)),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[Image Coverage] Error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });