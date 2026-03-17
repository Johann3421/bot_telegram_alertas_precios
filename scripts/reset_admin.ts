/**
 * Resetea la contraseña del admin y muestra el resultado de verificación.
 * Ejecutar dentro del contenedor o localmente con DATABASE_URL apuntando a la BD.
 *
 * Uso:
 *   npx tsx scripts/reset_admin.ts
 *
 * Para usar una contraseña personalizada:
 *   ADMIN_NEW_PASSWORD="MiClaveSegura123!" npx tsx scripts/reset_admin.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const prisma = new PrismaClient();

const TARGET_EMAIL = 'admin@precios.pe';
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD ?? 'Admin12345!';
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, hash] = storedHash.split(':');
  if (prefix !== 'scrypt' || !salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const inputBuffer = scryptSync(password, salt, hashBuffer.length);
  if (hashBuffer.length !== inputBuffer.length) return false;
  return timingSafeEqual(hashBuffer, inputBuffer);
}

async function main() {
  console.log(`\nConectando a la base de datos...`);
  console.log(`DATABASE_URL apunta a: ${process.env.DATABASE_URL?.replace(/:([^@:]+)@/, ':***@')}`);

  const existing = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, email: true, role: true, passwordHash: true },
  });

  if (existing) {
    console.log(`\n✓ Usuario encontrado:`);
    console.log(`  id:    ${existing.id}`);
    console.log(`  email: ${existing.email}`);
    console.log(`  role:  ${existing.role}`);
    console.log(`  hash:  ${existing.passwordHash?.slice(0, 20)}... (${existing.passwordHash?.length} chars)`);
  } else {
    console.log(`\n⚠ Usuario NO encontrado en la BD. Se creará.`);
  }

  const newHash = hashPassword(NEW_PASSWORD);
  const selfCheck = verifyPassword(NEW_PASSWORD, newHash);
  console.log(`\n✓ Nuevo hash generado. Auto-verificación: ${selfCheck ? 'OK' : 'FALLA — bug en hashPassword/verifyPassword'}`);

  if (!selfCheck) {
    console.error('ERROR: la auto-verificación del hash falló. Abortando.');
    process.exit(1);
  }

  await prisma.user.upsert({
    where: { email: TARGET_EMAIL },
    create: {
      email: TARGET_EMAIL,
      name: 'Administrador',
      passwordHash: newHash,
      role: 'ADMIN',
      alertThreshold: 15.0,
    },
    update: { passwordHash: newHash },
  });

  console.log(`\n✅ Contraseña actualizada correctamente en la BD.`);
  console.log(`   Email:      ${TARGET_EMAIL}`);
  console.log(`   Contraseña: ${NEW_PASSWORD}`);
  console.log(`\nAhora intenta iniciar sesión con esas credenciales.`);
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
