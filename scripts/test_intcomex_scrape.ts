import { prisma } from '../lib/prisma';
import { scrapeIntcomex } from '../scraper/providers/intcomex';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    throw new Error('Uso: npx tsx scripts/test_intcomex_scrape.ts <username> <password>');
  }

  const provider = await prisma.provider.findFirst({ where: { name: 'Intcomex' } });
  if (!provider) {
    throw new Error('Provider Intcomex no encontrado en la base de datos');
  }

  const job = await prisma.scrapeJob.create({
    data: {
      providerId: provider.id,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  await scrapeIntcomex(job.id, {
    credentialOverrides: {
      INTCOMEX: {
        username,
        password,
      },
    },
  });

  const result = await prisma.scrapeJob.findUnique({
    where: { id: job.id },
    include: { provider: true },
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());