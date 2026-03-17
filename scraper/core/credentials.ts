import { WholesalerProvider } from '@prisma/client';

export interface ScraperCredential {
  username: string;
  password: string;
}

export type ScraperCredentialMap = Partial<Record<WholesalerProvider, ScraperCredential>>;

const ENV_BY_PROVIDER: Record<WholesalerProvider, { user: string; pass: string }> = {
  DELTRON: { user: 'DELTRON_USER', pass: 'DELTRON_PASS' },
  INGRAM: { user: 'INGRAM_USER', pass: 'INGRAM_PASS' },
  INTCOMEX: { user: 'INTCOMEX_USER', pass: 'INTCOMEX_PASS' },
};

export function resolveWholesalerCredentials(
  provider: WholesalerProvider,
  overrides?: ScraperCredentialMap
): ScraperCredential | null {
  const override = overrides?.[provider];

  if (override?.username && override.password) {
    return override;
  }

  const envKeys = ENV_BY_PROVIDER[provider];
  const username = process.env[envKeys.user];
  const password = process.env[envKeys.pass];

  if (!username || !password) {
    return null;
  }

  return { username, password };
}