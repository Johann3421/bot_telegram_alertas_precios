import { NextRequest, NextResponse } from 'next/server';
import { WholesalerProvider } from '@prisma/client';
import { getRequiredUserSession } from '@/lib/session';
import {
  getUserCredentialSettings,
  updateUserCredentialSettings,
} from '@/lib/wholesaler-credentials';

export const dynamic = 'force-dynamic';

function withBroadcastSettings<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    broadcast: {
      inviteUrl: process.env.TELEGRAM_BROADCAST_INVITE_URL ?? null,
    },
  };
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Sesión requerida.' }, { status: 401 });
}

export async function GET() {
  try {
    const session = await getRequiredUserSession();
    const settings = await getUserCredentialSettings(session.user.id);
    return NextResponse.json(withBroadcastSettings(settings));
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse();
    }

    console.error('[Settings API] GET error:', error);
    return NextResponse.json({ error: 'No se pudo cargar la configuración.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getRequiredUserSession();
    const body = (await request.json()) as {
      profile?: {
        name?: string;
        telegramId?: string;
        alertThreshold?: number;
      };
      credentials?: Array<{
        provider: WholesalerProvider;
        username?: string;
        password?: string;
        remove?: boolean;
      }>;
    };

    await updateUserCredentialSettings(
      session.user.id,
      {
        name: body.profile?.name,
        telegramId: body.profile?.telegramId,
        alertThreshold: body.profile?.alertThreshold,
      },
      Array.isArray(body.credentials) ? body.credentials : []
    );

    const settings = await getUserCredentialSettings(session.user.id);

    return NextResponse.json(withBroadcastSettings({
      message: 'Configuración guardada correctamente.',
      ...settings,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return unauthorizedResponse();
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[Settings API] PUT error:', error);
    return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 });
  }
}