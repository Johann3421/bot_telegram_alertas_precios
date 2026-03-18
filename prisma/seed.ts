import { PrismaClient, ProviderType } from '@prisma/client';
import { hashPassword } from '../lib/password';

const prisma = new PrismaClient();

async function main() {
  // Crear proveedores iniciales
  const providers = [
    { name: 'Deltron', type: ProviderType.MAYORISTA, baseUrl: 'https://www.deltron.com.pe', requiresAuth: true },
    { name: 'Ingram Micro', type: ProviderType.MAYORISTA, baseUrl: 'https://www.ingrammicro.com', requiresAuth: true },
    { name: 'Intcomex', type: ProviderType.MAYORISTA, baseUrl: 'https://www.intcomex.com', requiresAuth: true },
    { name: 'Maxima Internacional', type: ProviderType.MAYORISTA, baseUrl: 'https://www.maximainternacional.com.pe', requiresAuth: true },
    { name: 'Compudiskett', type: ProviderType.MAYORISTA, baseUrl: 'https://ecommerce.compudiskett.com.pe', requiresAuth: true },
    { name: 'Coolbox', type: ProviderType.MINORISTA, baseUrl: 'https://www.coolbox.pe', requiresAuth: false },
    { name: 'Hiraoka', type: ProviderType.MINORISTA, baseUrl: 'https://www.hiraoka.com.pe', requiresAuth: false },
    { name: 'Impacto', type: ProviderType.MINORISTA, baseUrl: 'https://www.impacto.pe', requiresAuth: false },
    { name: 'Oechsle', type: ProviderType.MINORISTA, baseUrl: 'https://www.oechsle.pe', requiresAuth: false },
    { name: 'Sercoplus', type: ProviderType.MINORISTA, baseUrl: 'https://www.sercoplus.com', requiresAuth: false },
    { name: 'MercadoLibre', type: ProviderType.MINORISTA, baseUrl: 'https://www.mercadolibre.com.pe', requiresAuth: false },
    { name: 'Falabella', type: ProviderType.MINORISTA, baseUrl: 'https://www.falabella.com.pe', requiresAuth: false },
  ];

  for (const p of providers) {
    await prisma.provider.upsert({
      where: { name: p.name },
      create: p,
      update: {},
    });
  }

  // Usuario admin inicial
  const adminPasswordHash = hashPassword(process.env.ADMIN_SEED_PASSWORD ?? 'Admin12345!');

  await prisma.user.upsert({
    where: { email: 'admin@precios.pe' },
    create: {
      email: 'admin@precios.pe',
      name: 'Administrador',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      alertThreshold: 15.0,
    },
    update: {
      passwordHash: adminPasswordHash,
    },
  });

  console.log('Seed completado correctamente');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
