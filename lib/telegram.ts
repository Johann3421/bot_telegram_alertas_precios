import { Telegraf } from 'telegraf';
import { prisma } from '@/lib/prisma';

interface AlertWithRelations {
  id: string;
  marginPercent: number;
  mayoristPrice: number;
  minoristaPrice: number;
}

interface ListingWithProvider {
  price: number;
  url: string;
  provider: { name: string };
  product?: { canonicalName: string; imageUrl?: string | null } | null;
}

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBroadcastChatId(): string | null {
  return process.env.TELEGRAM_BROADCAST_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID ?? null;
}

function getJoinUrl(): string | null {
  return process.env.TELEGRAM_BROADCAST_INVITE_URL ?? null;
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

function getBot(): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Telegraf(token);
}

export async function sendTelegramAlert(
  alert: AlertWithRelations,
  mayListing: ListingWithProvider,
  minListing: ListingWithProvider
): Promise<void> {
  const bot = getBot();
  const chatId = getBroadcastChatId();
  if (!bot || !chatId) {
    console.warn('[Telegram] Bot token o chat ID no configurados, alerta no enviada');
    return;
  }

  const marginEmoji =
    alert.marginPercent >= 30 ? '🔥' : alert.marginPercent >= 20 ? '⚡' : '✅';

  const productName = mayListing.product?.canonicalName ?? 'Producto desconocido';
  const productImage = mayListing.product?.imageUrl ?? minListing.product?.imageUrl ?? null;
  const difference = minListing.price - mayListing.price;
  const joinUrl = getJoinUrl();

  const message = [
    `${marginEmoji} <b>ALERTA COMERCIAL PUBLICADA</b>`,
    '',
    `📦 <b>Producto:</b> ${escapeHtml(productName)}`,
    `📈 <b>Margen detectado:</b> ${alert.marginPercent.toFixed(1)}%`,
    `💰 <b>Diferencia estimada:</b> S/ ${difference.toFixed(2)}`,
    '',
    `🏭 <b>${escapeHtml(mayListing.provider.name)}:</b> S/ ${mayListing.price.toFixed(2)}`,
    `🏪 <b>${escapeHtml(minListing.provider.name)}:</b> S/ ${minListing.price.toFixed(2)}`,
    '',
    `🕒 ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
  ].join('\n');

  const buttons: Array<Array<{ text: string; url: string }>> = [];

  const dashboardAlertsUrl = isPublicHttpUrl(DASHBOARD_URL)
    ? new URL('/dashboard/alerts', DASHBOARD_URL).toString()
    : null;

  const primaryRow: Array<{ text: string; url: string }> = [];
  if (dashboardAlertsUrl) {
    primaryRow.push({
      text: 'Ver dashboard',
      url: dashboardAlertsUrl,
    });
  }

  if (isPublicHttpUrl(minListing.url)) {
    primaryRow.push({
      text: 'Ver oferta minorista',
      url: minListing.url,
    });
  }

  if (primaryRow.length > 0) {
    buttons.push(primaryRow);
  }

  if (isPublicHttpUrl(mayListing.url)) {
    buttons.push([
      {
        text: 'Ver oferta mayorista',
        url: mayListing.url,
      },
    ]);
  }

  if (isPublicHttpUrl(joinUrl)) {
    buttons.push([
      {
        text: 'Unirse al canal',
        url: joinUrl,
      },
    ]);
  }

  try {
    if (isRemoteImage(productImage)) {
      await bot.telegram.sendPhoto(chatId, productImage, {
        caption: message,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
    } else {
      await bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
    }

    await prisma.alert.update({
      where: { id: alert.id },
      data: { sentToTelegram: true, status: 'SENT' },
    });
  } catch (error) {
    console.error('[Telegram] Error enviando alerta:', error);
  }
}

// Comandos del bot para uso standalone
export function setupBotCommands(): Telegraf | null {
  const bot = getBot();
  if (!bot) return null;

  bot.command('status', async (ctx) => {
    const lastJob = await prisma.scrapeJob.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { provider: true },
    });

    await ctx.reply(
      `✅ Sistema activo\n` +
        `Último scraping: ${lastJob?.finishedAt?.toLocaleString('es-PE') ?? 'N/A'}\n` +
        `Proveedor: ${lastJob?.provider.name ?? 'N/A'}\n` +
        `Items: ${lastJob?.itemsFound ?? 0}`
    );
  });

  bot.command('alertas', async (ctx) => {
    const alerts = await prisma.alert.findMany({
      where: { status: 'SENT' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { product: true },
    });

    const msg = alerts.length
      ? alerts
          .map((a) => `• ${a.product.canonicalName} → ${a.marginPercent}%`)
          .join('\n')
      : 'No hay alertas recientes.';

    await ctx.reply(`📊 Últimas 5 alertas:\n\n${msg}`);
  });

  return bot;
}
