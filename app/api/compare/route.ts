import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, ProviderType } from '@prisma/client';

type ComparisonMode = 'WHOLESALE_VS_RETAIL' | 'PUBLIC_FALLBACK';

interface ComparisonRow {
  productId: string;
  canonicalName: string;
  category: string;
  mayoristPrice: number;
  mayoristName: string;
  mayoristUrl: string;
  mayoristRawName: string;
  minoristaPrice: number;
  minoristaName: string;
  minoristaUrl: string;
  minoristaRawName: string;
  marginPercent: number;
  difference: number;
  lastUpdated: Date;
}

interface ListingCandidate {
  price: number;
  currency: string;
  scrapedAt: Date;
  providerId: string;
  rawName: string;
  url: string;
  provider: {
    name: string;
    type: ProviderType;
  };
}

function buildRow(params: {
  productId: string;
  canonicalName: string;
  category: string;
  buyPrice: number;
  buyProvider: string;
  buyUrl: string;
  buyRawName: string;
  sellPrice: number;
  sellProvider: string;
  sellUrl: string;
  sellRawName: string;
  lastUpdated: Date;
}): ComparisonRow | null {
  const { buyPrice, sellPrice } = params;
  if (buyPrice <= 0 || sellPrice <= 0 || sellPrice <= buyPrice) {
    return null;
  }

  const difference = sellPrice - buyPrice;
  const marginPercent = Number((((difference / buyPrice) * 100)).toFixed(2));

  return {
    productId: params.productId,
    canonicalName: params.canonicalName,
    category: params.category,
    mayoristPrice: Number(buyPrice),
    mayoristName: params.buyProvider,
    mayoristUrl: params.buyUrl,
    mayoristRawName: params.buyRawName,
    minoristaPrice: Number(sellPrice),
    minoristaName: params.sellProvider,
    minoristaUrl: params.sellUrl,
    minoristaRawName: params.sellRawName,
    difference: Number(difference.toFixed(2)),
    marginPercent,
    lastUpdated: params.lastUpdated,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'TODOS';
  const minMargin = parseFloat(searchParams.get('minMargin') ?? '15');

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    canonicalName: { not: 'UNKNOWN' },
  };

  if (category !== 'TODOS') {
    where.category = category as never;
  }

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
      .map((product) => {
        const wholesalers = product.rawListings
          .filter((listing: ListingCandidate) => listing.provider.type === ProviderType.MAYORISTA && listing.currency === 'PEN')
          .sort((a: ListingCandidate, b: ListingCandidate) => a.price - b.price);
        const retailers = product.rawListings
          .filter((listing: ListingCandidate) => listing.provider.type === ProviderType.MINORISTA && listing.currency === 'PEN')
          .sort((a: ListingCandidate, b: ListingCandidate) => b.price - a.price);

        if (wholesalers.length === 0 || retailers.length === 0) {
          return null;
        }

        return buildRow({
          productId: product.id,
          canonicalName: product.canonicalName,
          category: String(product.category),
          buyPrice: wholesalers[0].price,
          buyProvider: wholesalers[0].provider.name,
          buyUrl: wholesalers[0].url,
          buyRawName: wholesalers[0].rawName,
          sellPrice: retailers[0].price,
          sellProvider: retailers[0].provider.name,
          sellUrl: retailers[0].url,
          sellRawName: retailers[0].rawName,
          lastUpdated: wholesalers[0].scrapedAt > retailers[0].scrapedAt ? wholesalers[0].scrapedAt : retailers[0].scrapedAt,
        });
      })
      .filter((item): item is ComparisonRow => Boolean(item));
  } else {
    items = products
      .map((product) => {
        const retailers = product.rawListings
          .filter((listing: ListingCandidate) => listing.provider.type === ProviderType.MINORISTA && listing.currency === 'PEN')
          .sort((a: ListingCandidate, b: ListingCandidate) => a.price - b.price);

        if (retailers.length < 2) {
          return null;
        }

        const cheapest = retailers[0];
        const priciest = [...retailers]
          .reverse()
          .find((listing: ListingCandidate) => listing.providerId !== cheapest.providerId);

        if (!priciest) {
          return null;
        }

        return buildRow({
          productId: product.id,
          canonicalName: product.canonicalName,
          category: String(product.category),
          buyPrice: cheapest.price,
          buyProvider: cheapest.provider.name,
          buyUrl: cheapest.url,
          buyRawName: cheapest.rawName,
          sellPrice: priciest.price,
          sellProvider: priciest.provider.name,
          sellUrl: priciest.url,
          sellRawName: priciest.rawName,
          lastUpdated: cheapest.scrapedAt > priciest.scrapedAt ? cheapest.scrapedAt : priciest.scrapedAt,
        });
      })
      .filter((item): item is ComparisonRow => Boolean(item));
  }

  const filteredItems = items
    .filter((item: ComparisonRow) => item.marginPercent >= minMargin)
    .sort((a: ComparisonRow, b: ComparisonRow) => b.marginPercent - a.marginPercent)
    .slice(0, 200);

  const stats = {
    totalComparisons: filteredItems.length,
    maxMargin: filteredItems.length > 0 ? Math.max(...filteredItems.map((r: ComparisonRow) => r.marginPercent)) : 0,
    avgMargin:
      filteredItems.length > 0
        ? Math.round((filteredItems.reduce((s: number, r: ComparisonRow) => s + r.marginPercent, 0) / filteredItems.length) * 100) / 100
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
