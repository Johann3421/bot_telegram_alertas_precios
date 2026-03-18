import { ProviderType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ComparisonMode = 'WHOLESALE_VS_RETAIL' | 'PUBLIC_FALLBACK';

export interface ComparisonRow {
  productId: string;
  canonicalName: string;
  category: string;
  mayoristPrice: number;
  mayoristName: string;
  mayoristUrl: string;
  mayoristRawName: string;
  mayoristProviderId: string;
  minoristaPrice: number;
  minoristaName: string;
  minoristaUrl: string;
  minoristaRawName: string;
  minoristaProviderId: string;
  marginPercent: number;
  difference: number;
  lastUpdated: Date;
}

export interface ListingCandidate {
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

export interface ComparisonProductRecord {
  id: string;
  canonicalName: string;
  category: string;
  rawListings: ListingCandidate[];
}

export interface ComparisonSelection {
  row: ComparisonRow;
  sourceListing: ListingCandidate;
  targetListing: ListingCandidate;
}

function buildRow(params: {
  productId: string;
  canonicalName: string;
  category: string;
  buy: ListingCandidate;
  sell: ListingCandidate;
}): ComparisonRow | null {
  if (params.buy.price <= 0 || params.sell.price <= 0 || params.sell.price <= params.buy.price) {
    return null;
  }

  const difference = params.sell.price - params.buy.price;
  const marginPercent = Number((((difference / params.buy.price) * 100)).toFixed(2));

  return {
    productId: params.productId,
    canonicalName: params.canonicalName,
    category: params.category,
    mayoristPrice: Number(params.buy.price),
    mayoristName: params.buy.provider.name,
    mayoristUrl: params.buy.url,
    mayoristRawName: params.buy.rawName,
    mayoristProviderId: params.buy.providerId,
    minoristaPrice: Number(params.sell.price),
    minoristaName: params.sell.provider.name,
    minoristaUrl: params.sell.url,
    minoristaRawName: params.sell.rawName,
    minoristaProviderId: params.sell.providerId,
    difference: Number(difference.toFixed(2)),
    marginPercent,
    lastUpdated: params.buy.scrapedAt > params.sell.scrapedAt ? params.buy.scrapedAt : params.sell.scrapedAt,
  };
}

function latestListingsByProvider(listings: ListingCandidate[]): ListingCandidate[] {
  const sorted = [...listings].sort((left, right) => right.scrapedAt.getTime() - left.scrapedAt.getTime());
  const unique = new Map<string, ListingCandidate>();

  for (const listing of sorted) {
    if (listing.currency !== 'PEN') {
      continue;
    }

    if (!unique.has(listing.providerId)) {
      unique.set(listing.providerId, listing);
    }
  }

  return Array.from(unique.values());
}

export function buildComparisonSelectionForProduct(
  product: ComparisonProductRecord,
  mode: ComparisonMode
): ComparisonSelection | null {
  const uniqueListings = latestListingsByProvider(product.rawListings);

  if (mode === 'WHOLESALE_VS_RETAIL') {
    const wholesalers = uniqueListings
      .filter((listing) => listing.provider.type === ProviderType.MAYORISTA)
      .sort((left, right) => left.price - right.price);
    const retailers = uniqueListings
      .filter((listing) => listing.provider.type === ProviderType.MINORISTA)
      .sort((left, right) => right.price - left.price);

    if (wholesalers.length === 0 || retailers.length === 0) {
      return null;
    }

    const row = buildRow({
      productId: product.id,
      canonicalName: product.canonicalName,
      category: product.category,
      buy: wholesalers[0],
      sell: retailers[0],
    });

    return row ? { row, sourceListing: wholesalers[0], targetListing: retailers[0] } : null;
  }

  const retailers = uniqueListings
    .filter((listing) => listing.provider.type === ProviderType.MINORISTA)
    .sort((left, right) => left.price - right.price);

  if (retailers.length < 2) {
    return null;
  }

  const cheapest = retailers[0];
  const priciest = [...retailers].reverse().find((listing) => listing.providerId !== cheapest.providerId);

  if (!priciest) {
    return null;
  }

  const row = buildRow({
    productId: product.id,
    canonicalName: product.canonicalName,
    category: product.category,
    buy: cheapest,
    sell: priciest,
  });

  return row ? { row, sourceListing: cheapest, targetListing: priciest } : null;
}

export async function getCurrentComparisonForProduct(productId: string): Promise<ComparisonSelection | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      canonicalName: true,
      category: true,
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

  if (!product) {
    return null;
  }

  const hasWholesalerListings = product.rawListings.some(
    (listing) => listing.provider.type === ProviderType.MAYORISTA && listing.currency === 'PEN'
  );

  return buildComparisonSelectionForProduct(product as ComparisonProductRecord, hasWholesalerListings ? 'WHOLESALE_VS_RETAIL' : 'PUBLIC_FALLBACK');
}

export function buildCompareWhere(category: string): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    canonicalName: { not: 'UNKNOWN' },
  };

  if (category !== 'TODOS') {
    where.category = category as never;
  }

  return where;
}