import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ProviderType } from '@prisma/client';
import { buildCompareWhere, buildComparisonSelectionForProduct, type ComparisonMode, type ComparisonRow } from '@/lib/comparison';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'TODOS';
  const minMargin = parseFloat(searchParams.get('minMargin') ?? '15');

  const where = buildCompareWhere(category);

  const hasWholesalerData =
    (await prisma.rawListing.count({
      where: {
        productId: { not: null },
        inStock: true,
        provider: { type: ProviderType.MAYORISTA },
      },
    })) > 0;

  const mode: ComparisonMode = hasWholesalerData ? 'WHOLESALE_VS_RETAIL' : 'PUBLIC_FALLBACK';
  let items: ComparisonRow[] = [];

  const products = await prisma.product.findMany({
    where: {
      ...where,
      ...(mode === 'PUBLIC_FALLBACK' ? { sku: { not: null } } : {}),
    },
    select: {
      id: true,
      canonicalName: true,
      category: true,
      sku: true,
      rawListings: {
        where: { inStock: true },
        select: {
          price: true,
          currency: true,
          scrapedAt: true,
          providerId: true,
          rawName: true,
          url: true,
          provider: {
            select: {
              name: true,
              type: true,
            },
          },
        },
        orderBy: { scrapedAt: 'desc' },
      },
    },
  });

  if (hasWholesalerData) {
    items = products
      .map((product) => buildComparisonSelectionForProduct(product as never, 'WHOLESALE_VS_RETAIL')?.row ?? null)
      .filter((item): item is ComparisonRow => item !== null);
  } else {
    items = products
      .map((product) => buildComparisonSelectionForProduct(product as never, 'PUBLIC_FALLBACK')?.row ?? null)
      .filter((item): item is ComparisonRow => item !== null);
  }

  const filteredItems = items
    .filter((item) => item.marginPercent >= minMargin)
    .sort((a, b) => b.marginPercent - a.marginPercent)
    .slice(0, 200);

  const stats = {
    totalComparisons: filteredItems.length,
    maxMargin: filteredItems.length > 0 ? Math.max(...filteredItems.map((r) => r.marginPercent)) : 0,
    avgMargin:
      filteredItems.length > 0
        ? Math.round((filteredItems.reduce((s, r) => s + r.marginPercent, 0) / filteredItems.length) * 100) / 100
        : 0,
    totalProducts: await prisma.product.count({ where: { isActive: true } }),
    activeAlerts: await prisma.alert.count({ where: { status: 'PENDING' } }),
  };

  return NextResponse.json({
    items: filteredItems,
    stats,
    meta: {
      mode,
      sourceLabel: mode === 'WHOLESALE_VS_RETAIL' ? 'Mayorista' : 'Proveedor base',
      targetLabel: mode === 'WHOLESALE_VS_RETAIL' ? 'Minorista' : 'Proveedor comparado',
      message:
        mode === 'WHOLESALE_VS_RETAIL'
          ? 'Comparativa normal entre mayoristas y minoristas.'
          : 'Modo temporal estricto: no hay datos mayoristas. Solo se comparan coincidencias publicas con huella tecnica exacta y misma moneda.',
    },
  });
}
