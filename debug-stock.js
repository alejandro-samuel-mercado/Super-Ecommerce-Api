const prisma = require('./src/config/prisma');

async function main() {
  try {
    const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
    console.log('--- STORE CONFIG ---');
    console.log(JSON.stringify(config, null, 2));
    
    const branches = await prisma.branch.findMany();
    console.log('\n--- BRANCHES ---');
    console.log(JSON.stringify(branches.map(b => ({id: b.id, name: b.name})), null, 2));

    // Try to find the product
    const products = await prisma.product.findMany({
      where: { name: { contains: 'Nancy' } },
      include: { skus: true }
    });
    console.log('\n--- PRODUCTS (Nancy) ---');
    console.log(JSON.stringify(products, null, 2));

    for (const p of products) {
      for (const sku of p.skus) {
        const inventory = await prisma.branchInventory.findMany({
          where: { skuId: sku.id }
        });
        console.log(`\n--- INVENTORY FOR SKU ${sku.code} (ID: ${sku.id}) ---`);
      console.log(JSON.stringify(inventory, null, 2));

      const reservations = await prisma.stockReservation.findMany({
        where: { skuId: sku.id, released: false, expiresAt: { gt: new Date() } }
      });
      console.log(`\n--- RESERVATIONS FOR SKU ${sku.id} ---`);
      console.log(JSON.stringify(reservations, null, 2));
      
      const totalReserved = reservations.reduce((sum, r) => sum + Number(r.quantity), 0);
      console.log(`TOTAL RESERVED: ${totalReserved}`);
    }
  }
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
