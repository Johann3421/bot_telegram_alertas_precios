import { Category, RawListing } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractProductSku, extractAllProductSkus, tokenJaccard, quickNormalize } from './normalizer';

interface ScrapedItemInput {
  providerId: string;
  rawName: string;
  price: number;
  url: string;
  imageUrl?: string;
  currency?: 'PEN' | 'USD';
  inStock?: boolean;
}

const VALID_CATEGORIES = new Set(Object.values(Category));
const GENERIC_TOKENS = new Set([
  'AURICULAR',
  'AURICULARES',
  'UNIDAD',
  'ALMACENAMIENTO',
  'MEMORIA',
  'TECLADO',
  'MOUSE',
  'CASE',
  'COMBO',
  'MONITOR',
  'LAPTOP',
  'TABLET',
  'CELULAR',
  'SMARTPHONE',
  'DISCO',
  'SSD',
  'RAM',
  'DE',
  'DEL',
  'LA',
  'EL',
  'CON',
  'PARA',
]);

function normalizeCategory(category?: string): Category {
  if (category && VALID_CATEGORIES.has(category as Category)) {
    return category as Category;
  }

  return 'OTRO';
}

function fallbackBrand(rawName: string): string {
  const tokens = rawName
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const candidate = tokens.find((token) => !GENERIC_TOKENS.has(token) && token.length > 2);
  return candidate || 'UNKNOWN';
}

function buildFallbackCanonicalName(rawName: string, brand: string): string {
  const normalizedName = rawName
    .toUpperCase()
    .replace(/[^A-Z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedName) {
    return brand;
  }

  if (brand !== 'UNKNOWN' && normalizedName.startsWith(brand)) {
    return normalizedName;
  }

  return `${brand} ${normalizedName}`.trim();
}

function hasStrongNormalizedIdentity(canonicalName?: string, brand?: string, model?: string): boolean {
  return Boolean(
    canonicalName &&
      canonicalName !== 'UNKNOWN' &&
      brand &&
      brand !== 'UNKNOWN' &&
      model &&
      model.trim().length >= 3
  );
}

function parseNumericCandidate(rawCandidate: string): number | null {
  const candidate = rawCandidate.replace(/\s+/g, '');
  const lastComma = candidate.lastIndexOf(',');
  const lastDot = candidate.lastIndexOf('.');

  let normalized = candidate;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = normalized.split(thousandSeparator).join('');
    normalized = normalized.replace(decimalSeparator, '.');
  } else if (lastComma !== -1) {
    const decimals = candidate.length - lastComma - 1;
    normalized =
      decimals === 2
        ? candidate.replace(/\./g, '').replace(',', '.')
        : candidate.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimals = candidate.length - lastDot - 1;
    normalized = decimals === 2 ? candidate.replace(/,/g, '') : candidate.replace(/\./g, '');
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parsePriceText(priceText: string): number | null {
  const matches = priceText.match(/\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})/g) ?? [];
  const parsedValues = matches
    .map(parseNumericCandidate)
    .filter((value): value is number => value !== null && value > 0);

  if (parsedValues.length === 0) {
    return null;
  }

  return Math.min(...parsedValues);
}

export function detectCurrencyCode(priceText: string): 'PEN' | 'USD' {
  const normalizedText = priceText.toUpperCase();

  if (normalizedText.includes('S/') || normalizedText.includes('PEN')) {
    return 'PEN';
  }

  if (normalizedText.includes('US$') || normalizedText.includes('$')) {
    return 'USD';
  }

  return 'PEN';
}

export function parsePriceTextForCurrency(
  priceText: string,
  currency: 'PEN' | 'USD'
): number | null {
  const currencyMatches =
    currency === 'PEN'
      ? priceText.match(/S\/\s*\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{2})|S\/\s*\d+(?:[.,]\d{2})/g)
      : priceText.match(/(?:US\$|\$)\s*\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{2})|(?:US\$|\$)\s*\d+(?:[.,]\d{2})/g);

  if (!currencyMatches || currencyMatches.length === 0) {
    return parsePriceText(priceText);
  }

  const parsedValues = currencyMatches
    .map((match) => match.replace(/^(?:US\$|\$|S\/)+\s*/g, '').trim())
    .map(parseNumericCandidate)
    .filter((value): value is number => value !== null && value > 0);

  if (parsedValues.length === 0) {
    return parsePriceText(priceText);
  }

  return Math.min(...parsedValues);
}

export function toAbsoluteUrl(baseUrl: string, candidateUrl: string, rawName: string): string {
  if (candidateUrl) {
    try {
      return new URL(candidateUrl, baseUrl).toString();
    } catch {
      // Ignore malformed URLs and fall back to a deterministic synthetic URL.
    }
  }

  return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(rawName)}`;
}

export function toAbsoluteMediaUrl(baseUrl: string, candidateUrl?: string): string | undefined {
  if (!candidateUrl?.trim()) {
    return undefined;
  }

  try {
    return new URL(candidateUrl.trim(), baseUrl).toString();
  } catch {
    return undefined;
  }
}

async function resolveProduct(rawName: string) {
  const rawLabel = rawName.trim().replace(/\s+/g, ' ');
  // Extrae todos los candidatos de SKU para maximizar coincidencias
  const allSkus = extractAllProductSkus(rawLabel);
  const sku = allSkus[0] ?? extractProductSku(rawLabel);
  const normalized = quickNormalize(rawLabel);
  const brand = normalized.brand && normalized.brand !== 'UNKNOWN'
    ? normalized.brand.trim()
    : fallbackBrand(rawLabel);
  const model =
    normalized.model?.trim() && normalized.model.trim().length >= 3
      ? normalized.model.trim()
      : rawLabel;
  const canonicalName = hasStrongNormalizedIdentity(
    normalized.canonicalName?.trim(),
    normalized.brand?.trim(),
    normalized.model?.trim()
  )
    ? normalized.canonicalName!.trim()
    : buildFallbackCanonicalName(rawLabel, brand);
  const category = normalizeCategory(normalized.category);

  // 1️⃣ Búsqueda exacta por cualquiera de los SKU candidatos
  for (const candidateSku of allSkus) {
    const skuProduct = await prisma.product.findUnique({ where: { sku: candidateSku } });
    if (skuProduct) {
      // Actualizar SKU principal si el producto no lo tenía
      if (!skuProduct.sku) {
        return prisma.product.update({ where: { id: skuProduct.id }, data: { sku: candidateSku } });
      }
      return skuProduct;
    }
  }

  // 2️⃣ Búsqueda por nombre canónico / brand+model exacto
  const existingProduct = await prisma.product.findFirst({
    where: hasStrongNormalizedIdentity(canonicalName, brand, model)
      ? {
          OR: [
            { canonicalName: { equals: canonicalName, mode: 'insensitive' } } as never,
            {
              brand: { equals: brand, mode: 'insensitive' },
              model: { equals: model, mode: 'insensitive' },
            } as never,
          ],
        }
      : {
          canonicalName: { equals: canonicalName, mode: 'insensitive' },
        },
  });

  if (existingProduct) {
    if (sku && !existingProduct.sku) {
      return prisma.product.update({ where: { id: existingProduct.id }, data: { sku } });
    }
    return existingProduct;
  }

  // 3️⃣ Búsqueda por similitud Jaccard (evita duplicados con nombres ligeramente distintos)
  // Solo comparar productos de la misma marca para limitar el espacio de búsqueda
  if (brand !== 'UNKNOWN') {
    const samesBrandProducts = await prisma.product.findMany({
      where: { brand: { equals: brand, mode: 'insensitive' } },
      select: { id: true, canonicalName: true, sku: true },
    });

    const JACCARD_THRESHOLD = 0.60;
    let bestMatch: { id: string; score: number } | null = null;

    for (const p of samesBrandProducts) {
      const score = tokenJaccard(rawLabel, p.canonicalName);
      if (score >= JACCARD_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: p.id, score };
      }
    }

    if (bestMatch) {
      // Producto muy similar encontrado: no crear duplicado
      if (sku) {
        const existing = await prisma.product.findUnique({ where: { id: bestMatch.id } });
        if (existing && !existing.sku) {
          return prisma.product.update({ where: { id: bestMatch.id }, data: { sku } });
        }
      }
      return prisma.product.findUniqueOrThrow({ where: { id: bestMatch.id } });
    }
  }

  // 4️⃣ Crear producto nuevo
  return prisma.product.create({
    data: {
      canonicalName,
      brand,
      model,
      category,
      sku,
    },
  });
}

function normalizeImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) {
    return undefined;
  }

  const normalized = imageUrl.trim();
  return /^https?:\/\//i.test(normalized) ? normalized : undefined;
}

export async function upsertScrapedListing(input: ScrapedItemInput): Promise<RawListing> {
  const normalizedImageUrl = normalizeImageUrl(input.imageUrl);
  const product = await resolveProduct(input.rawName);

  if (normalizedImageUrl && product.imageUrl !== normalizedImageUrl) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        imageUrl: product.imageUrl || normalizedImageUrl,
      },
    });
  }

  const listing = await prisma.rawListing.upsert({
    where: {
      providerId_url: {
        providerId: input.providerId,
        url: input.url,
      },
    },
    create: {
      providerId: input.providerId,
      productId: product.id,
      rawName: input.rawName,
      price: input.price,
      currency: input.currency ?? 'PEN',
      url: input.url,
      inStock: input.inStock ?? true,
    },
    update: {
      productId: product.id,
      rawName: input.rawName,
      price: input.price,
      currency: input.currency ?? 'PEN',
      inStock: input.inStock ?? true,
      scrapedAt: new Date(),
    },
  });

  await prisma.priceLog.create({
    data: {
      listingId: listing.id,
      providerId: input.providerId,
      price: input.price,
    },
  });

  return listing;
}

export async function finalizeScrapeJob(
  jobId: string,
  itemsFound: number,
  errorMessage?: string,
  metrics?: {
    backendUsed?: string;
    strategyUsed?: string;
    pagesAttempted?: number;
    pagesSucceeded?: number;
  }
): Promise<void> {
  const failed = Boolean(errorMessage) || itemsFound === 0;

  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status: failed ? 'FAILED' : 'DONE',
      finishedAt: new Date(),
      itemsFound,
      backendUsed: metrics?.backendUsed,
      strategyUsed: metrics?.strategyUsed,
      pagesAttempted: metrics?.pagesAttempted ?? 0,
      pagesSucceeded: metrics?.pagesSucceeded ?? 0,
      errors: failed ? errorMessage ?? 'No se encontraron productos validos para este proveedor' : null,
    },
  });
}