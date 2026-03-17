import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const skip = (page - 1) * limit;

  const where = status ? { status: status as 'PENDING' | 'SENT' | 'DISMISSED' | 'EXPIRED' } : {};

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        product: true,
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return NextResponse.json({
    items: alerts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id y status son requeridos' }, { status: 400 });
  }

  const validStatuses = ['PENDING', 'SENT', 'DISMISSED', 'EXPIRED'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }

  const alert = await prisma.alert.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json(alert);
}
