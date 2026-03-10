const prisma = require('../src/config/prisma');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Iniciando Seed Realista desde JSON...');

  const dataPath = path.join(__dirname, 'seed_ecommerce_realistic.json');
  const fileContent = fs.readFileSync(dataPath, 'utf8');
  const { categories, products } = JSON.parse(fileContent);

  console.log(`📦 Encontrados: ${categories.length} categorías y ${products.length} productos.`);

  // 1. LIMPIEZA DE CATÁLOGO
  console.log('🧹 Limpiando tablas de catálogo...');
  const tables = ['VariantOption', 'BranchInventory', 'SKU', 'Product', 'Category'];
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
    } catch (e) {
      console.warn(`  ⚠️ No se pudo truncar ${table}: ${e.message}`);
    }
  }

  // 2. CONFIGURACIÓN BASE (Monedas, Pasarelas y Tienda)
  console.log('⚙️ Configurando monedas y pasarelas...');
  
  const ars = await prisma.currency.upsert({
    where: { code: 'ARS' },
    update: {},
    create: { code: 'ARS', symbol: '$', exchangeRateToBase: 1.0, isActive: true }
  });

  const usd = await prisma.currency.upsert({
    where: { code: 'USD' },
    update: {},
    create: { code: 'USD', symbol: 'U$D', exchangeRateToBase: 1200.0, isActive: true }
  });

  // Pasarelas
  const gateways = [
    { name: 'Mercado Pago', slug: 'mercadopago', fallback: true, currencies: ['ARS'] },
    { name: 'Stripe', slug: 'stripe', fallback: false, currencies: ['USD', 'ARS'] },
    { name: 'PayPal', slug: 'paypal', fallback: false, currencies: ['USD'] }
  ];

  for (const gw of gateways) {
    const gateway = await prisma.paymentGateway.upsert({
      where: { slug: gw.slug },
      update: { isActive: true, isGlobalFallback: gw.fallback },
      create: { name: gw.name, slug: gw.slug, isActive: true, isGlobalFallback: gw.fallback }
    });

    for (const currCode of gw.currencies) {
      await prisma.gatewayCurrencySupport.upsert({
        where: { gatewayId_currencyCode: { gatewayId: gateway.id, currencyCode: currCode } },
        update: {},
        create: { gatewayId: gateway.id, currencyCode: currCode, isPrimary: currCode === gw.currencies[0] }
      });
    }
  }

  // Actualizar configuración de tienda para habilitar métodos
  await prisma.storeConfig.update({
    where: { id: 1 },
    data: {
      enabledPaymentMethods: ['MERCADO_PAGO', 'STRIPE', 'PAYPAL', 'CASH', 'TRANSFER']
    }
  }).catch(() => console.warn('⚠️ No se pudo actualizar StoreConfig (¿id=1 no existe?)'));

  // 3. Obtener sucursal base (Casa Central)
  const branch = await prisma.branch.findFirst({
    where: { isHeadquarters: true }
  }) || await prisma.branch.findFirst();

  if (!branch) {
    console.error('❌ Error: No se encontró ninguna sucursal. Por favor ejecuta el seed base primero.');
    return;
  }
  console.log(`📍 Usando sucursal: ${branch.name} (ID: ${branch.id})`);

  // 2. Insertar Categorías (manejo jerárquico simple por niveles)
  console.log('📂 Procesando categorías...');
  
  // Ordenar categorías: primero las que no tienen parentId
  const sortedCategories = [...categories].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return 0;
  });

  for (const cat of sortedCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, parentId: cat.parentId },
      create: { 
        id: cat.id,
        name: cat.name, 
        slug: cat.slug, 
        parentId: cat.parentId 
      }
    });
  }
  console.log('✅ Categorías sincronizadas.');

  // 3. Procesar Productos
  console.log('🛒 Procesando productos y SKUs...');
  let productCount = 0;
  let skuCount = 0;

  for (const pData of products) {
    const { skus, ...pFields } = pData;

    try {
      // Upsert Product (basado en nombre o QR para evitar duplicados si se re-ejecuta)
      const product = await prisma.product.upsert({
        where: { qr: pFields.qr || 'none' }, // El QR suele ser único en este JSON
        update: {
          ...pFields,
          basePrice: parseFloat(pFields.basePrice)
        },
        create: {
          ...pFields,
          basePrice: parseFloat(pFields.basePrice)
        }
      });

      productCount++;

      // Procesar SKUs
      for (const skuData of skus) {
        const { variantOptions, ...skuFields } = skuData;

        const sku = await prisma.sKU.upsert({
          where: { code: skuFields.code },
          update: {
            ...skuFields,
            price: parseFloat(skuFields.price),
            stock: parseFloat(skuFields.stock),
            productId: product.id
          },
          create: {
            ...skuFields,
            price: parseFloat(skuFields.price),
            stock: parseFloat(skuFields.stock),
            productId: product.id
          }
        });

        skuCount++;

        // Variantes
        if (variantOptions && variantOptions.length > 0) {
          for (const opt of variantOptions) {
            await prisma.variantOption.upsert({
              where: {
                skuId_name: {
                  skuId: sku.id,
                  name: opt.name
                }
              },
              update: { value: opt.value },
              create: {
                skuId: sku.id,
                name: opt.name,
                value: opt.value
              }
            });
          }
        }

        // Inventario en sucursal (para que aparezcan a la venta)
        await prisma.branchInventory.upsert({
          where: {
            skuId_branchId: {
              skuId: sku.id,
              branchId: branch.id
            }
          },
          update: {
            stock: parseFloat(skuFields.stock),
            price: parseFloat(skuFields.price),
            isActive: true
          },
          create: {
            skuId: sku.id,
            branchId: branch.id,
            stock: parseFloat(skuFields.stock),
            price: parseFloat(skuFields.price),
            isActive: true
          }
        });
      }
    } catch (error) {
      console.error(`⚠️ Error procesando producto "${pData.name}":`, error.message);
    }
  }

  console.log(`\n✨ Finalizado: ${productCount} productos y ${skuCount} SKUs procesados.`);
}

main()
  .catch(e => {
    console.error('❌ Error crítico en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
