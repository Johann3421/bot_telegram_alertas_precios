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
    runningJob,
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
    prisma.scrapeJob.findFirst({
      where: { status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
      include: { provider: true },
    }),
    prisma.provider.findMany({
      include: {
        _count: {
          select: { rawListings: true, scrapeJobs: true },
        },
        scrapeJobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            status: true,
            itemsFound: true,
            backendUsed: true,
            strategyUsed: true,
            pagesAttempted: true,
            pagesSucceeded: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const providers = providerStats.map((provider) => {
    const completedJobs = provider.scrapeJobs.filter(
      (job) => job.status === 'DONE' || job.status === 'FAILED'
    );
    const successfulJobs = completedJobs.filter(
      (job) => job.status === 'DONE' && job.itemsFound > 0
    );
    const latestJob = provider.scrapeJobs[0] ?? null;

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      isActive: provider.isActive,
      listings: provider._count.rawListings,
      jobs: provider._count.scrapeJobs,
      successRate:
        completedJobs.length > 0
          ? Math.round((successfulJobs.length / completedJobs.length) * 100)
          : 0,
      lastBackend: latestJob?.backendUsed ?? '-',
      lastStrategy: latestJob?.strategyUsed ?? '-',
      lastItemsFound: latestJob?.itemsFound ?? 0,
      pagesSucceeded: latestJob?.pagesSucceeded ?? 0,
      pagesAttempted: latestJob?.pagesAttempted ?? 0,
    };
  });

  return NextResponse.json({
    totalProducts,
    totalListings,
    totalAlerts,
    pendingAlerts,
    scrapeStatus: {
      isRunning: Boolean(runningJob),
      runningJob: runningJob
        ? {
            jobId: runningJob.id,
            provider: runningJob.provider.name,
            startedAt: runningJob.startedAt,
            itemsFound: runningJob.itemsFound,
            pagesSucceeded: runningJob.pagesSucceeded ?? 0,
            pagesAttempted: runningJob.pagesAttempted ?? 0,
            backendUsed: runningJob.backendUsed,
            strategyUsed: runningJob.strategyUsed,
            elapsedSeconds: Math.max(
              0,
              Math.floor((Date.now() - runningJob.startedAt.getTime()) / 1000)
            ),
          }
        : null,
    },
    lastScrape: lastJob
      ? {
          provider: lastJob.provider.name,
          status: lastJob.status,
          finishedAt: lastJob.finishedAt,
          itemsFound: lastJob.itemsFound,
          backendUsed: lastJob.backendUsed,
          strategyUsed: lastJob.strategyUsed,
        }
      : null,
    providers,
  });
}
