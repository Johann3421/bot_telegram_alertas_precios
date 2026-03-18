import OpenAI from 'openai';

export interface NormalizedProduct {
  canonicalName: string;
  brand: string;
  model: string;
  category: string;
  confidence: number;
}

const TECH_IDENTIFIER_BLACKLIST = new Set([
  'DDR3', 'DDR4', 'DDR5', 'SSD', 'NVME', 'M2', 'M.2', 'FHD', 'QHD', 'WUXGA',
  'RTX3050', 'RTX4050', 'RTX4060', 'RTX4070', 'RTX5060', 'RTX5070',
  'RYZEN3', 'RYZEN5', 'RYZEN7', 'RYZEN9', 'COREI3', 'COREI5', 'COREI7', 'COREI9',
  'WIN11', 'WINDOWS11', 'FREEDOS', 'MACOS',
]);

function normalizeAsciiUpper(rawName: string): string {
  return rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizeIdentifierToken(token: string): string {
  return token.replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function scoreIdentifierToken(token: string, rawName: string): number {
  let score = token.length;
  if (token.includes('-')) score += 4;
  if (/[A-Z]/.test(token) && /\d/.test(token)) score += 6;
  if (new RegExp(`\\(${token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\)`).test(rawName)) {
    score += 8;
  }
  return score;
}

function isGenericChipModel(token: string): boolean {
  return (
    /^(?:I[3579]|N)\d{3,5}[A-Z]{0,3}$/i.test(token.replace(/-/g, '')) ||
    /^I[3579]-?\d{4,5}[A-Z]{0,3}$/i.test(token) ||
    /^RYZEN[3579]-?\d{4,5}[A-Z]{0,3}$/i.test(token.replace(/\s+/g, '')) ||
    /^RTX-?\d{4,5}$/i.test(token) ||
    /^GTX-?\d{4,5}$/i.test(token)
  );
}

function isGenericCapacityToken(token: string): boolean {
  return /^(?:\d{2,5})(?:GB|TB|MHZ|HZ|W)$/i.test(token.replace(/\s+/g, ''));
}

export function extractProductSku(rawName: string): string | null {
  const normalized = normalizeAsciiUpper(rawName);
  const tokens = normalized.match(/[A-Z0-9-]{5,}/g) ?? [];

  const candidates = Array.from(new Set(tokens))
    .map(normalizeIdentifierToken)
    .filter(Boolean)
    .filter((token) => /[A-Z]/.test(token) && /\d/.test(token))
    .filter((token) => token.length >= 5)
    .filter((token) => !TECH_IDENTIFIER_BLACKLIST.has(token.replace(/-/g, '')))
    .filter((token) => !isGenericChipModel(token))
    .filter((token) => !isGenericCapacityToken(token))
    .sort((left, right) => scoreIdentifierToken(right, normalized) - scoreIdentifierToken(left, normalized));

  return candidates[0] ?? null;
}

/**
 * Devuelve hasta 3 candidatos de SKU ordenados por puntuación.
 * Útil para buscar coincidencias alternativas cuando el SKU principal no está en DB.
 */
export function extractAllProductSkus(rawName: string): string[] {
  const normalized = normalizeAsciiUpper(rawName);
  const tokens = normalized.match(/[A-Z0-9-]{5,}/g) ?? [];

  const candidates = Array.from(new Set(tokens))
    .map(normalizeIdentifierToken)
    .filter(Boolean)
    .filter((token) => /[A-Z]/.test(token) && /\d/.test(token))
    .filter((token) => token.length >= 5)
    .filter((token) => !TECH_IDENTIFIER_BLACKLIST.has(token.replace(/-/g, '')))
    .filter((token) => !isGenericChipModel(token))
    .filter((token) => !isGenericCapacityToken(token))
    .sort((left, right) => scoreIdentifierToken(right, normalized) - scoreIdentifierToken(left, normalized));

  return candidates.slice(0, 3);
}

/**
 * Tokens significativos para comparar nombres de productos.
 * Filtra palabras genéricas, artículos y palabras cortas.
 */
const MATCH_STOP_WORDS = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'CON', 'PARA', 'EN', 'Y', 'THE',
  'WITH', 'AND', 'FOR', 'LAPTOP', 'NOTEBOOK', 'PC', 'SSD', 'RAM', 'HDD',
  'MONITOR', 'TECLADO', 'MOUSE', 'DISCO', 'MEMORIA', 'PROCESADOR',
  'COMPUTADORA', 'COMPUTADOR', 'EQUIPO', 'PORTATIL', 'PORTATILES',
]);

function meaningfulTokens(name: string): Set<string> {
  return new Set(
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !MATCH_STOP_WORDS.has(t))
  );
}

/**
 * Similitud Jaccard entre dos nombres de producto (0..1).
 * Un valor >= 0.6 sugiere que probablemente son el mismo producto.
 */
export function tokenJaccard(a: string, b: string): number {
  const setA = meaningfulTokens(a);
  const setB = meaningfulTokens(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersectionCount = 0;
  setA.forEach((t) => { if (setB.has(t)) intersectionCount++; });
  const unionSet = new Set<string>();
  setA.forEach((t) => unionSet.add(t));
  setB.forEach((t) => unionSet.add(t));
  return unionSet.size === 0 ? 0 : intersectionCount / unionSet.size;
}

const BRANDS = [
  'ASUS', 'HP', 'DELL', 'LENOVO', 'ACER', 'MSI', 'SAMSUNG',
  'LG', 'INTEL', 'AMD', 'NVIDIA', 'SEAGATE', 'WD', 'KINGSTON',
  'LOGITECH', 'EPSON', 'CANON', 'XIAOMI', 'APPLE', 'TOSHIBA',
  'CORSAIR', 'RAZER', 'GIGABYTE', 'HUAWEI', 'SONY', 'TP-LINK',
  'WESTERN DIGITAL', 'CRUCIAL', 'HIKVISION', 'DAHUA', 'BENQ',
  'VIEWSONIC', 'AOC', 'PHILIPS', 'TRANSCEND', 'PNY', 'SANDISK',
  'PATRIOT', 'GSKILL', 'HYPERX', 'COOLER MASTER', 'NZXT', 'SEASONIC',
  'EVGA', 'ZOTAC', 'PALIT', 'SAPPHIRE', 'BROTHER', 'LEXMARK',
  'D-LINK', 'NETGEAR', 'UBIQUITI', 'MIKROTIK', 'HONEYWELL', 'ZEBRA',
  'ANKER', 'BELKIN', 'TARGUS', 'GENIUS', 'A4TECH', 'REDRAGON',
  'THERMALTAKE', 'FRACTAL', 'LIAN LI', 'DEEPCOOL',
  'JBL', 'BOSE', 'SENNHEISER', 'JABRA', 'POLY', 'PLANTRONICS',
  'FORZA', 'CG MOBILE', 'EPSON', 'BROTHER',
];

const CATEGORY_RULES: Record<string, string[]> = {
  LAPTOP: ['LAPTOP', 'NOTEBOOK', 'VIVOBOOK', 'IDEAPAD', 'THINKPAD', 'THINKBOOK', 'PAVILION', 'INSPIRON', 'LATITUDE', 'ASPIRE', 'SWIFT', 'PREDATOR', 'ZENBOOK', 'PROBOOK', 'ELITEBOOK', 'CHROMEBOOK', 'ENVY', 'SPECTRE', 'OMEN LAPTOP'],
  DESKTOP: ['DESKTOP', 'PC', 'TORRE', 'ALL IN ONE', 'AIO', 'OPTIPLEX', 'PRODESK', 'WORKSTATION'],
  MONITOR: ['MONITOR', 'PANTALLA', 'DISPLAY', 'LED IPS', 'LED VA', 'LED TN'],
  SMARTPHONE: ['CELULAR', 'SMARTPHONE', 'PHONE', 'IPHONE', 'GALAXY', 'REDMI', 'NOTE PRO', 'MOTO'],
  TABLET: ['TABLET', 'IPAD', 'SURFACE GO', 'SURFACE PRO'],
  COMPONENTE: ['PROCESADOR', 'CPU', 'GPU', 'RAM', 'MEMORIA', 'TARJETA DE VIDEO', 'MOTHERBOARD', 'PLACA MADRE', 'FUENTE DE PODER', 'DISCO DURO', 'SSD', 'M.2', 'NVME', 'DIMM', 'SODIMM'],
  PERIFERICO: ['TECLADO', 'MOUSE', 'RATON', 'AUDIFONO', 'HEADSET', 'WEBCAM', 'IMPRESORA', 'SCANNER', 'GAMEPAD', 'JOYSTICK', 'MICROFONO'],
  NETWORKING: ['ROUTER', 'SWITCH', 'ACCESS POINT', 'REPETIDOR', 'WIFI', 'CABLE RED', 'PATCH PANEL', 'FIREWALL', 'NVR'],
  ALMACENAMIENTO: ['USB', 'PENDRIVE', 'DISCO EXTERNO', 'NAS', 'MEMORIA SD', 'MICRO SD', 'FLASH DRIVE'],
  GAMING: ['OMEN', 'ROG', 'TUF GAMING', 'NITRO', 'HELIOS', 'LEGION', 'VICTUS'],
};

// Reglas heurísticas (sin costo de API)
export function quickNormalize(rawName: string): Partial<NormalizedProduct> {
  const name = rawName.toUpperCase();

  const detectedBrand = BRANDS.find((b) => name.includes(b)) ?? 'UNKNOWN';

  let detectedCategory = 'OTRO';
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((k) => name.includes(k))) {
      detectedCategory = cat;
      break;
    }
  }

  // Intentar extraer modelo (texto después de la marca)
  let detectedModel = '';
  if (detectedBrand !== 'UNKNOWN') {
    const brandIdx = name.indexOf(detectedBrand);
    const afterBrand = name.slice(brandIdx + detectedBrand.length).trim();
    // Tomar las primeras 5 palabras como modelo aproximado
    detectedModel = afterBrand.split(/\s+/).slice(0, 5).join(' ').trim();
  }

  return {
    brand: detectedBrand,
    category: detectedCategory,
    model: detectedModel,
    canonicalName: `${detectedBrand} ${detectedModel}`.trim(),
    confidence: detectedBrand !== 'UNKNOWN' ? 0.6 : 0.3,
  };
}

// Normalización con IA para casos ambiguos (batch, no por request individual)
export async function aiNormalize(
  rawNames: string[]
): Promise<NormalizedProduct[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-...') {
    console.warn('[Normalizer] OpenAI API key no configurada, usando normalización heurística');
    return rawNames.map((name) => {
      const partial = quickNormalize(name);
      return {
        canonicalName: partial.canonicalName ?? name,
        brand: partial.brand ?? 'UNKNOWN',
        model: partial.model ?? '',
        category: partial.category ?? 'OTRO',
        confidence: partial.confidence ?? 0.3,
      };
    });
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `
Eres un experto en catálogos de productos tecnológicos del mercado peruano.
Normaliza estos nombres de productos y responde SOLO con un array JSON válido.

Nombres a normalizar:
${rawNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Responde con este formato exacto (sin markdown, solo JSON puro):
[
  {
    "canonicalName": "ASUS VivoBook 15 X515EA i5-1135G7",
    "brand": "ASUS",
    "model": "VivoBook 15 X515EA",
    "category": "LAPTOP",
    "confidence": 0.95
  }
]

Categorías válidas: LAPTOP, DESKTOP, MONITOR, SMARTPHONE, TABLET, COMPONENTE, PERIFERICO, NETWORKING, ALMACENAMIENTO, OTRO
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    return JSON.parse(response.choices[0].message.content ?? '[]');
  } catch (error) {
    console.error('[Normalizer] Error con IA, fallback a heurística:', error);
    return rawNames.map((name) => {
      const partial = quickNormalize(name);
      return {
        canonicalName: partial.canonicalName ?? name,
        brand: partial.brand ?? 'UNKNOWN',
        model: partial.model ?? '',
        category: partial.category ?? 'OTRO',
        confidence: partial.confidence ?? 0.3,
      };
    });
  }
}
