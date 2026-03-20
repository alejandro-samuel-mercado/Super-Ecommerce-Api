const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const CartService = require('./src/services/cart.service');

async function reproduce() {
  // 1. Encontrar un SKU con stock en ramas pero 0 en SKU.stock
  const sku = await prisma.sKU.findFirst({
    where: { stock: 0, isDeleted: false, active: true },
    include: { branchInventory: true }
  });

  if (!sku) {
      console.log("No SKU found with 0 global stock. Trying to find any SKU and force 0 stock for test.");
      const anySku = await prisma.sKU.findFirst({ where: { isDeleted: false } });
      if (!anySku) return console.log("No SKUs at all.");
      await prisma.sKU.update({ where: { id: anySku.id }, data: { stock: 0 } });
      return reproduce();
  }

  console.log(`Testing with SKU ID: ${sku.id}, Global Stock: ${sku.stock}`);
  
  // 2. Crear un usuario de prueba
  const user = await prisma.user.findFirst();
  if (!user) return console.log("No user found.");

  // 3. Limpiar carrito del usuario
  await CartService.clearCart(user.id);

  // 4. Intentar mergear un item en el carrito local
  const localItems = [{ skuId: sku.id, quantity: 1 }];
  console.log("Merging local items...");
  const result = await CartService.mergeCart(user.id, localItems);

  console.log("Result items count:", result.items.length);
  if (result.items.length === 0) {
      console.log("REPRODUCED: Item was deleted during merge because global stock is 0!");
  } else {
      console.log("NOT REPRODUCED: Item still in cart.");
  }
}

reproduce().catch(console.error).finally(() => prisma.$disconnect());
