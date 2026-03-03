require('dotenv').config();
const prisma = require('./src/config/prisma');

/**
 * Sincronización de Inventario por Sucursal
 * Crea registros BranchInventory para todos los SKUs en una sucursal específica
 * Ejecutar: node sync-branch-inventory.js [sucursalId]
 */

async function syncBranchInventory(sucursalId) {
  try {
    console.log(`\n===== Sincronizando Inventario para la Sucursal ${sucursalId} =====\n`);
    
    /** 1. Verificar si la sucursal existe */
    const sucursal = await prisma.sucursal.findUnique({
      where: { id: sucursalId }
    });
    
    if (!sucursal) {
      console.error(`❌ ¡Sucursal ${sucursalId} no encontrada!`);
      return;
    }
    
    console.log(`✅ Sucursal encontrada: ${sucursal.name}`);
    
    /** 2. Obtener todos los SKUs activos */
    const allSkus = await prisma.sKU.findMany({
      where: {
        product: { isActive: true }
      },
      include: {
        product: {
          select: { id: true, name: true, basePrice: true }
        }
      }
    });
    
    console.log(`\n📦 Se encontraron ${allSkus.length} SKUs activos\n`);
    
    /** 3. Verificar qué SKUs ya tienen inventario para esta sucursal */
    const existingInventory = await prisma.branchInventory.findMany({
      where: { sucursalId }
    });
    
    const existingSkuIds = new Set(existingInventory.map(inv => inv.skuId));
    console.log(`📋 ${existingInventory.length} SKUs ya tienen registros de inventario`);
    
    /** 4. Crear inventario para los SKUs faltantes */
    const skusToCreate = allSkus.filter(sku => !existingSkuIds.has(sku.id));
    
    if (skusToCreate.length === 0) {
      console.log(`\n✅ Todos los SKUs ya tienen registros de inventario para la Sucursal ${sucursalId}`);
      return;
    }
    
    console.log(`\n➕ Creando inventario para ${skusToCreate.length} SKUs...\n`);
    
    let created = 0;
    let failed = 0;
    
    for (const sku of skusToCreate) {
      try {
        await prisma.branchInventory.create({
          data: {
            skuId: sku.id,
            sucursalId: sucursalId,
            stock: 0,
            minStock: 5,
            price: sku.product.basePrice,
            isActive: true
          }
        });
        
        created++;
        if (created % 10 === 0) {
          console.log(`  ✓ Creados ${created} registros...`);
        }
      } catch (error) {
        failed++;
        console.error(`  ✗ Falló para SKU ${sku.id}:`, error.message);
      }
    }
    
    console.log(`\n===== Sincronización Completa =====`);
    console.log(`✅ Creados: ${created}`);
    console.log(`❌ Fallidos: ${failed}`);
    console.log(`📊 Total de registros de inventario: ${existingInventory.length + created}`);
    
    console.log(`\n💡 Tip: Ahora puedes actualizar las cantidades de stock para cada SKU en el Control de Stock`);
    
  } catch (error) {
    console.error('\n❌ Error sincronizando inventario:', error);
  } finally {
    await prisma.$disconnect();
  }
}

/** Obtener el ID de la sucursal desde la línea de comandos */
const sucursalId = parseInt(process.argv[2]);

if (!sucursalId || isNaN(sucursalId)) {
  console.error('Uso: node sync-branch-inventory.js [sucursalId]');
  console.error('Ejemplo: node sync-branch-inventory.js 2');
  process.exit(1);
}

syncBranchInventory(sucursalId);
