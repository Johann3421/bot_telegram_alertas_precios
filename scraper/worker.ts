import 'dotenv/config';

import { setupBotCommands } from '@/lib/telegram';
import { closeBrowser, startScheduler } from './index';

async function shutdown(signal: string) {
  console.log(`[Worker] Señal recibida: ${signal}. Cerrando recursos...`);
  await closeBrowser();
  process.exit(0);
}

async function main() {
  console.log('[Worker] Iniciando scheduler de scraping...');
  startScheduler();

  const bot = setupBotCommands();
  if (bot) {
    await bot.launch();
    console.log('[Worker] Bot de Telegram operativo para comandos /status y /alertas');
  } else {
    console.log('[Worker] Bot de Telegram no lanzado: faltan TELEGRAM_BOT_TOKEN y/o chat configurado');
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch(async (error) => {
  console.error('[Worker] Error fatal:', error);
  await closeBrowser();
  process.exit(1);
});