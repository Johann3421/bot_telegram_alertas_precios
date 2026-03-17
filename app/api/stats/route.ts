import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [
    totalProducts,
    totalListings,
    totalAlerts,
    pendingAlerts,
    lastJob,
    providerStats,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.rawListing.count({ where: { inStock: true } }),
    prisma.alert.count(),
    prisma.alert.count({ where: { status: 'PENDING' } }),
    prisma.scrapeJob.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { provider: true },
    }),
    prisma.provider.findMany({
      include: {
        _count: {
          select: { rawListings: true, scrapeJobs: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return NextResponse.json({
    totalProducts,
    totalListings,
    totalAlerts,
    pendingAlerts,
    lastScrape: lastJob
      ? {
          provider: lastJob.provider.name,
          status: lastJob.status,
          finishedAt: lastJob.finishedAt,
          itemsFound: lastJob.itemsFound,
        }
      : null,
    providers: providerStats.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      isActive: p.isActive,
      listings: p._count.rawListings,
      jobs: p._count.scrapeJobs,
    })),
  });
}
