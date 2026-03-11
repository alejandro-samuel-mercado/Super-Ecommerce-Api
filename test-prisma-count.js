const prisma = require('./src/config/prisma');

async function test() {
  try {
    const activeBranchId = 1;
    const where = {
      isActive: true,
      isDeleted: false,
      skus: { 
         some: { 
           branchInventory: { 
             some: { 
               branchId: activeBranchId,
               isActive: true
             } 
           } 
         } 
       }
    };
    console.log("WHERE:", JSON.stringify(where, null, 2));
    const total = await prisma.product.count({ where });
    console.log("SUCCESS:", total);
  } catch(e) {
    console.error("ERROR:");
    console.error(e.message);
  } finally {
    process.exit(0);
  }
}

test();
