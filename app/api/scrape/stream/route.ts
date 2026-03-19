import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Auto-cleanup threshold: jobs stuck in RUNNING for more than 20 minutes
const STALE_JOB_THRESHOLD_MS = 20 * 60 * 1000;

interface RunningJobInfo {
  jobId: string;
  provider: string;
  startedAt: string;
  itemsFound: number;
  pagesSucceeded: number;
  pagesAttempted: number;
  backendUsed: string | null;
  strategyUsed: string | null;
  elapsedSeconds: number;
}

interface LastScrapeInfo {
  provider: string;
  status: string;
  finishedAt: string | null;
  itemsFound: number;
  backendUsed: string | null;
  strategyUsed: string | null;
}

interface ScrapeStreamPayload {
  isRunning: boolean;
  runningJob: RunningJobInfo | null;
  lastScrape: LastScrapeInfo | null;
  timestamp: number;
}

async function buildPayload(): Promise<ScrapeStreamPayload> {
  // Auto-clean stale RUNNING jobs before querying state
  await prisma.scrapeJob.updateMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: new Date(Date.now() - STALE_JOB_THRESHOLD_MS) },
    },
    data: {
      status: 'FAILED',
      errors: 'Job estancado: limpiado automáticamente (>20 min sin finalizar)',
      finishedAt: new Date(),
    },
  });

  const [runningJob, lastJob] = await Promise.all([
    prisma.scrapeJob.findFirst({
      where: { status: 'RUNNING' },
      orderBy: { startedAt: 'desc' },
      include: { provider: true },
    }),
    prisma.scrapeJob.findFirst({
      where: { status: { in: ['DONE', 'FAILED'] } },
      orderBy: { finishedAt: 'desc' },
      include: { provider: true },
    }),
  ]);

  return {
    isRunning: Boolean(runningJob),
    runningJob: runningJob
      ? {
          jobId: runningJob.id,
          provider: runningJob.provider.name,
          startedAt: runningJob.startedAt ? runningJob.startedAt.toISOString() : new Date().toISOString(),
          itemsFound: runningJob.itemsFound,
          pagesSucceeded: runningJob.pagesSucceeded ?? 0,
          pagesAttempted: runningJob.pagesAttempted ?? 0,
          backendUsed: runningJob.backendUsed,
          strategyUsed: runningJob.strategyUsed,
          elapsedSeconds: runningJob.startedAt
            ? Math.max(0, Math.floor((Date.now() - runningJob.startedAt.getTime()) / 1000))
            : 0,
        }
      : null,
    lastScrape: lastJob
      ? {
          provider: lastJob.provider.name,
          status: lastJob.status,
          finishedAt: lastJob.finishedAt ? lastJob.finishedAt.toISOString() : null,
          itemsFound: lastJob.itemsFound,
          backendUsed: lastJob.backendUsed,
          strategyUsed: lastJob.strategyUsed,
        }
      : null,
    timestamp: Date.now(),
  };
}

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      request.signal.addEventListener('abort', () => {
        closed = true;
      });

      const enqueue = (payload: ScrapeStreamPayload) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      // Send initial state immediately
      try {
        enqueue(await buildPayload());
      } catch {
        controller.close();
        return;
      }

      // Poll DB every 3 seconds and push updates
      const intervalId = setInterval(async () => {
        if (closed) {
          clearInterval(intervalId);
          try {
            controller.close();
          } catch {
            // already closed
          }
          return;
        }

        try {
          enqueue(await buildPayload());
        } catch {
          clearInterval(intervalId);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }, 3000);
    },
    cancel() {
      // ReadableStream cancelled (client disconnected)
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
