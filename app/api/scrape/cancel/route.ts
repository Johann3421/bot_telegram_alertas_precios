import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequiredUserSession } from '@/lib/session';

export async function POST() {
  try {
    await getRequiredUserSession();

    // Mark all RUNNING jobs as FAILED immediately
    const result = await prisma.scrapeJob.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errors: 'Cancelado manualmente por el usuario',
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({
      message:
        result.count > 0
          ? `Scraping cancelado (${result.count} job${result.count !== 1 ? 's' : ''} detenido${result.count !== 1 ? 's' : ''})`
          : 'No había ningún scraping en ejecución',
      count: result.count,
    });
  } catch (error) {
    console.error('[Scrape Cancel] Error:', error);
    return NextResponse.json({ error: 'Error al cancelar el scraping' }, { status: 500 });
  }
}
