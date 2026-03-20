const prisma = require('./src/config/prisma');

async function check() {
  try {
    const skus = await prisma.sKU.findMany({ 
      where: { isDeleted: false },
      select: { id: true, stock: true, code: true },
      take: 10
    });
    console.log('SKUs Stock:', JSON.stringify(skus, null, 2));
    
    const branchStock = await prisma.branchInventory.findMany({ 
      take: 10,
      select: { skuId: true, branchId: true, stock: true }
    });
    console.log('Branch Stock:', JSON.stringify(branchStock, null, 2));

    const carts = await prisma.cart.findMany({ 
      include: { _count: { select: { items: true } } } 
    });
    console.log('Carts:', JSON.stringify(carts, null, 2));

  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
