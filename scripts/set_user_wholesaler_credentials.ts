import { PrismaClient, WholesalerProvider } from '@prisma/client';
import { encryptSecret } from '../lib/secrets';

const prisma = new PrismaClient();

async function main() {
  const [, , email, providerArg, username, password] = process.argv;

  if (!email || !providerArg || !username || !password) {
    throw new Error(
      'Uso: npx tsx scripts/set_user_wholesaler_credentials.ts <email> <provider> <username> <password>'
    );
  }

  const provider = providerArg.toUpperCase() as WholesalerProvider;
  const validProviders = new Set<WholesalerProvider>([
    'DELTRON',
    'INGRAM',
    'INTCOMEX',
    'MAXIMA',
    'COMPUDISKETT',
  ]);

  if (!validProviders.has(provider)) {
    throw new Error(`Proveedor inválido: ${providerArg}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error(`Usuario no encontrado: ${email}`);
  }

  await prisma.userWholesalerCredential.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider,
      },
    },
    create: {
      userId: user.id,
      provider,
      usernameEncrypted: encryptSecret(username),
      passwordEncrypted: encryptSecret(password),
    },
    update: {
      usernameEncrypted: encryptSecret(username),
      passwordEncrypted: encryptSecret(password),
    },
  });

  console.log(`Credenciales ${provider} guardadas para ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());