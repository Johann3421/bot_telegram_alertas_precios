import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const productId = params.id;

  const priceLogs = await prisma.priceLog.findMany({
    where: {
      listing: {
        productId: productId,
      },
    },
    include: {
      provider: true,
    },
    orderBy: {
      recordedAt: 'asc',
    },
    take: 500,
  });

  // Agrupar por fecha y proveedor
  const history = priceLogs.map((log) => ({
    date: log.recordedAt.toISOString().slice(0, 10),
    price: log.price,
    provider: log.provider.name,
  }));

  const providers = Array.from(new Set(history.map((h) => h.provider)));

  return NextResponse.json({ history, providers });
}
