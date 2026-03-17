import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nombre, correo y contraseña son obligatorios.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
    }

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        role: 'VIEWER',
      },
    });

    return NextResponse.json({ message: 'Cuenta creada correctamente.' }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Ese correo ya está registrado.' }, { status: 409 });
    }

    console.error('[Register API] Error:', error);
    return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 500 });
  }
}