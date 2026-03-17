import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { isActive: true };
  if (category && category !== 'TODOS') {
    where.category = category;
  }
  if (search) {
    where.canonicalName = { contains: search, mode: 'insensitive' };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: {
        rawListings: {
          include: { provider: true },
          orderBy: { scrapedAt: 'desc' },
          take: 6,
        },
        _count: { select: { alerts: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    items: products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { canonicalName, brand, model, category, sku } = body;

  if (!canonicalName || !brand || !model || !category) {
    return NextResponse.json(
      { error: 'canonicalName, brand, model y category son requeridos' },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: {
      canonicalName,
      brand,
      model,
      category,
      sku: sku || null,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
