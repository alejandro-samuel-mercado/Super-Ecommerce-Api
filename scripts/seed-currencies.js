const prisma = require('../src/config/prisma');

async function main() {
  console.log('Sembrando monedas...');
  
  /** 1. Crear ARS como moneda base */
  const ars = await prisma.currency.upsert({
    where: { code: 'ARS' },
    update: {},
    create: {
      code: 'ARS',
      symbol: '$',
      exchangeRateToBase: 1.0,
      isActive: true,
    },
  });

  /** 2. Actualizar la configuración de la tienda con ARS como base */
  await prisma.storeConfig.upsert({
    where: { id: 1 },
    update: {
      baseCurrency: 'ARS',
      defaultCurrency: 'ARS',
    },
    create: {
      id: 1,
      storeName: 'Mi Tienda',
      baseCurrency: 'ARS',
      defaultCurrency: 'ARS',
    }
  });

  console.log('La moneda base ARS se ha sembrado y la configuración de la tienda se ha actualizado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
