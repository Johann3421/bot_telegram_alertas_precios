import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function getCurrentUserSession() {
  return getServerSession(authOptions);
}

export async function getRequiredUserSession() {
  const session = await getCurrentUserSession();

  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }

  return session;
}