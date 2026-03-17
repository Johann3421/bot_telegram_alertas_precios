import 'dotenv/config';

import { Telegraf } from 'telegraf';

import { prisma } from '@/lib/prisma';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRemoteImage(url?: string | null): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function isPublicHttpUrl(url?: string | null): url is string {
  if (!url || !/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function getCandidateProduct() {
  const products = await prisma.product.findMany({
    where: {
      imageUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      canonicalName: true,
      imageUrl: true,
      rawListings: {
        include: {
          provider: true,
        },
        orderBy: {
          scrapedAt: 'desc',
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 50,
  });

  for (const product of products) {
    const mayorista = product.rawListings.find((listing) => listing.provider.type === 'MAYORISTA' && listing.inStock);
    const minorista = product.rawListings.find((listing) => listing.provider.type === 'MINORISTA' && listing.inStock);

    if (mayorista && minorista) {
      return { product, mayorista, minorista };
    }
  }

  const fallback = products[0];
  if (!fallback) {
    return null;
  }

  return {
    product: fallback,
    mayorista: null,
    minorista: fallback.rawListings.find((listing) => listing.inStock) ?? null,
  };
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_BROADCAST_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID;
  const joinUrl = process.env.TELEGRAM_BROADCAST_INVITE_URL;
  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (!token || !chatId) {
    throw new Error('Falta TELEGRAM_BOT_TOKEN o TELEGRAM_BROADCAST_CHAT_ID/TELEGRAM_CHAT_ID');
  }

  const candidate = await getCandidateProduct();
  if (!candidate) {
    throw new Error('No se encontró un producto con imagen para la prueba de difusión');
  }

  const { product, mayorista, minorista } = candidate;
  const margin = mayorista && minorista ? ((minorista.price - mayorista.price) / mayorista.price) * 100 : null;
  const difference = mayorista && minorista ? minorista.price - mayorista.price : null;

  const lines = [
    '📣 <b>PRUEBA OPERATIVA DEL CANAL</b>',
    '',
    `📦 <b>Producto:</b> ${escapeHtml(product.canonicalName)}`,
  ];

  if (mayorista && minorista && margin !== null && difference !== null) {
    lines.push(`📈 <b>Margen observado:</b> ${margin.toFixed(1)}%`);
    lines.push(`💰 <b>Diferencia estimada:</b> S/ ${difference.toFixed(2)}`);
    lines.push('');
    lines.push(`🏭 <b>${escapeHtml(mayorista.provider.name)}:</b> S/ ${mayorista.price.toFixed(2)}`);
    lines.push(`🏪 <b>${escapeHtml(minorista.provider.name)}:</b> S/ ${minorista.price.toFixed(2)}`);
  } else if (minorista) {
    lines.push(`🏪 <b>Referencia minorista:</b> ${escapeHtml(minorista.provider.name)} - S/ ${minorista.price.toFixed(2)}`);
  }

  lines.push('');
  lines.push('✅ Mensaje enviado para validar publicación real, formato e imagen en el canal.');
  lines.push(`🕒 ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [];

  const primaryRow: Array<{ text: string; url: string }> = [];
  if (isPublicHttpUrl(dashboardUrl)) {
    primaryRow.push({
      text: 'Ver dashboard',
      url: new URL('/dashboard/alerts', dashboardUrl).toString(),
    });
  }

  if (isPublicHttpUrl(minorista?.url)) {
    primaryRow.push({
      text: 'Ver referencia',
      url: minorista.url,
    });
  }

  if (primaryRow.length > 0) {
    inlineKeyboard.push(primaryRow);
  }

  if (isPublicHttpUrl(joinUrl)) {
    inlineKeyboard.push([
      {
        text: 'Unirse al canal',
        url: joinUrl,
      },
    ]);
  }

  const bot = new Telegraf(token);
  const message = lines.join('\n');

  if (isRemoteImage(product.imageUrl)) {
    await bot.telegram.sendPhoto(chatId, product.imageUrl, {
      caption: message,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  } else {
    await bot.telegram.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  }

  console.log(`Mensaje de prueba enviado a ${chatId} con producto: ${product.canonicalName}`);
}

main()
  .catch((error) => {
    console.error('[Telegram Test] Error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });