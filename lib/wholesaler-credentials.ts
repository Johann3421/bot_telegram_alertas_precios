import { WholesalerProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import type { ScraperCredentialMap } from '@/scraper/core/credentials';

export const WHOLESALER_PROVIDERS: Array<{
  key: WholesalerProvider;
  label: string;
  hint: string;
}> = [
  {
    key: 'DELTRON',
    label: 'Deltron',
    hint: 'Portal mayorista con acceso por usuario y clave distribuidor.',
  },
  {
    key: 'INGRAM',
    label: 'Ingram Micro',
    hint: 'Acceso corporativo para catálogo y stock autenticado.',
  },
  {
    key: 'INTCOMEX',
    label: 'Intcomex',
    hint: 'Sesión empresarial para portal de productos y precios.',
  },
];

export async function getUserCredentialSettings(userId: string) {
  const [user, storedCredentials] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        telegramId: true,
        alertThreshold: true,
      },
    }),
    prisma.userWholesalerCredential.findMany({
      where: { userId },
      orderBy: { provider: 'asc' },
    }),
  ]);

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const credentialMap = new Map(storedCredentials.map((credential) => [credential.provider, credential]));

  return {
    profile: user,
    credentials: WHOLESALER_PROVIDERS.map((provider) => {
      const stored = credentialMap.get(provider.key);

      return {
        provider: provider.key,
        label: provider.label,
        hint: provider.hint,
        username: stored ? decryptSecret(stored.usernameEncrypted) : '',
        hasPassword: Boolean(stored?.passwordEncrypted),
        configuredAt: stored?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

interface CredentialInput {
  provider: WholesalerProvider;
  username?: string;
  password?: string;
  remove?: boolean;
}

interface ProfileInput {
  name?: string;
  telegramId?: string;
  alertThreshold?: number;
}

export async function updateUserCredentialSettings(
  userId: string,
  profile: ProfileInput,
  credentials: CredentialInput[]
) {
  const existingCredentials = await prisma.userWholesalerCredential.findMany({
    where: { userId },
  });

  const existingMap = new Map(existingCredentials.map((credential) => [credential.provider, credential]));

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: typeof profile.name === 'string' ? profile.name.trim() : undefined,
      telegramId: typeof profile.telegramId === 'string' ? profile.telegramId.trim() || null : undefined,
      alertThreshold:
        typeof profile.alertThreshold === 'number' && Number.isFinite(profile.alertThreshold)
          ? profile.alertThreshold
          : undefined,
    },
  });

  for (const credential of credentials) {
    const current = existingMap.get(credential.provider);

    if (credential.remove) {
      if (current) {
        await prisma.userWholesalerCredential.delete({ where: { id: current.id } });
      }
      continue;
    }

    const username = credential.username?.trim() ?? '';
    const password = credential.password?.trim() ?? '';

    if (!username && !password) {
      continue;
    }

    if (!username) {
      throw new Error(`Falta usuario para ${credential.provider}`);
    }

    if (!password && !current) {
      throw new Error(`Falta contraseña para ${credential.provider}`);
    }

    const usernameEncrypted = encryptSecret(username);
    const passwordEncrypted = password ? encryptSecret(password) : current?.passwordEncrypted;

    if (!passwordEncrypted) {
      throw new Error(`Falta contraseña para ${credential.provider}`);
    }

    await prisma.userWholesalerCredential.upsert({
      where: {
        userId_provider: {
          userId,
          provider: credential.provider,
        },
      },
      create: {
        userId,
        provider: credential.provider,
        usernameEncrypted,
        passwordEncrypted,
      },
      update: {
        usernameEncrypted,
        passwordEncrypted,
      },
    });
  }
}

export async function getUserScraperCredentialMap(userId: string): Promise<ScraperCredentialMap> {
  const credentials = await prisma.userWholesalerCredential.findMany({ where: { userId } });

  return credentials.reduce<ScraperCredentialMap>((accumulator, credential) => {
    accumulator[credential.provider] = {
      username: decryptSecret(credential.usernameEncrypted),
      password: decryptSecret(credential.passwordEncrypted),
    };
    return accumulator;
  }, {});
}