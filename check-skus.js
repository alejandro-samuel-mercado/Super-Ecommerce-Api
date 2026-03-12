const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMismatchedSkus() {
  console.log('Checking for mismatched SKUs...');
  
  const skus = await prisma.sKU.findMany({
    include: {
      product: true
    }
  });

  let count = 0;
  skus.forEach(sku => {
    // This is virtually impossible with Prisma relations, but checking if there's any weirdness
    if (sku.productId !== sku.product.id) {
       console.error(`ERROR: SKU ${sku.id} (code: ${sku.code}) has productId ${sku.productId} but linked product has id ${sku.product.id}`);
       count++;
    }
  });

  if (count === 0) {
    console.log('No direct Prisma relation mismatches found.');
  }

  // Check for SKUs that belong to the same product but have very different properties? 
  // No, the user says "variants that I put in others".
  
  // Let's check if any SKU Code suggests a different product ID than its productId
  skus.forEach(sku => {
     const match = sku.code.match(/^(\d+)-/);
     if (match) {
        const expectedId = parseInt(match[1]);
        if (expectedId !== sku.productId) {
           console.warn(`WARNING: SKU ${sku.id} has code ${sku.code} (suggests product ${expectedId}) but is linked to product ${sku.productId}`);
        }
     }
  });

  await prisma.$disconnect();
}

checkMismatchedSkus().catch(e => {
  console.error(e);
  process.exit(1);
});
