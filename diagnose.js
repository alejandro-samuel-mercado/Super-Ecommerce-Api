const prisma = require('./src/config/prisma');

async function main() {
  const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
  const currencies = await prisma.currency.findMany({ where: { isActive: true } });
  
  console.log('--- StoreConfig ---');
  console.log(JSON.stringify(config, null, 2));
  
  console.log('\n--- Active Currencies ---');
  console.log(JSON.stringify(currencies, null, 2));

  const nancy = await prisma.product.findFirst({
    where: { name: { contains: 'Nancy' } },
    include: { variants: { include: { skus: true } } }
  });

  if (nancy) {
    console.log('\n--- Nancy Pancy Details ---');
    console.log(`Name: ${nancy.name}`);
    console.log(`Base Price: ${nancy.variants[0]?.skus[0]?.price}`);
  } else {
    console.log('\n--- Nancy Pancy Not Found ---');
    const firstProduct = await prisma.product.findFirst({
        include: { variants: { include: { skus: true } } }
    });
    if (firstProduct) {
        console.log(`First product found: ${firstProduct.name}`);
        console.log(`Price: ${firstProduct.variants[0]?.skus[0]?.price}`);
    }
  }
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
