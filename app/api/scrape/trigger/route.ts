import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequiredUserSession } from '@/lib/session';
import { getUserScraperCredentialMap } from '@/lib/wholesaler-credentials';

// Jobs RUNNING con más de 45 min se consideran estancados
const STALE_JOB_THRESHOLD_MS = 45 * 60 * 1000;

export async function POST() {
  // Disparar scraping en background sin bloquear la respuesta
  // Se usa import dinámico para no cargar Playwright en el servidor Next
  try {
    const session = await getRequiredUserSession();

    // Auto-limpiar jobs RUNNING estancados antes de verificar
    await prisma.scrapeJob.updateMany({
      where: {
        status: 'RUNNING',
        startedAt: { lt: new Date(Date.now() - STALE_JOB_THRESHOLD_MS) },
      },
      data: {
        status: 'FAILED',
        errors: 'Job estancado: limpiado automáticamente (>45 min sin finalizar)',
        finishedAt: new Date(),
      },
    });

    // Verificación básica: no ejecutar si ya hay un job corriendo (reciente)
    const runningJob = await prisma.scrapeJob.findFirst({
      where: { status: 'RUNNING' },
    });

    if (runningJob) {
      return NextResponse.json(
        { message: 'Ya hay un scraping en ejecución', jobId: runningJob.id },
        { status: 409 }
      );
    }

    const credentialOverrides = await getUserScraperCredentialMap(session.user.id);
    const personalCredentialsCount = Object.keys(credentialOverrides).length;

    // Disparar en background - no await
    import('@/scraper').then(({ runAllScrapers }) => {
      runAllScrapers({ credentialOverrides }).catch((err: unknown) =>
        console.error('[Scrape Trigger] Error:', err)
      );
    });

    return NextResponse.json({
      message:
        personalCredentialsCount > 0
          ? 'Scraping iniciado. Se usarán tus credenciales mayoristas guardadas donde estén disponibles.'
          : 'Scraping iniciado. No tienes credenciales mayoristas guardadas; se usará .env como respaldo temporal.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Scrape Trigger] Error:', error);
    return NextResponse.json(
      { error: 'Error al iniciar scraping' },
      { status: 500 }
    );
  }
}
