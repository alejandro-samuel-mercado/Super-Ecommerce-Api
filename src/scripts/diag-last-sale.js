const prisma = require('../config/prisma');

async function diag() {
  console.log('--- DIAGNÓSTICO DE ÚLTIMA VENTA PAGO FÁCIL ---');
  
  const lastSale = await prisma.sale.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      stockReservations: true
    }
  });

  if (!lastSale) {
    console.log('No se encontraron ventas.');
    return;
  }

  console.log(`Venta ID: ${lastSale.id} (#${lastSale.ticketNumber || 'N/A'})`);
  console.log(`Estado Pago: ${lastSale.paymentStatus}`);
  console.log(`Tipo Pago: ${lastSale.paymentType}`);
  console.log(`Sucursal: ${lastSale.branchId}`);
  console.log(`Metadatos MP: ${lastSale.mpPaymentId || 'Ninguno'}`);
  
  console.log('\nItems:');
  for (const item of lastSale.items) {
    const inv = await prisma.branchInventory.findUnique({
      where: { skuId_branchId: { skuId: item.skuId, branchId: lastSale.branchId } }
    });
    console.log(`- SKU ${item.skuId}: Cantidad ${item.quantity} | Stock Actual Inv: ${inv?.stock}`);
  }

  console.log('\nReservas:');
  lastSale.stockReservations.forEach(r => {
    console.log(`- Reserva ${r.id}: released=${r.released}, expiresAt=${r.expiresAt.toISOString()}`);
  });

  console.log('\nÚltimos Movimientos de Stock para esta venta:');
  const movements = await prisma.stockMovement.findMany({
    where: { referenceId: { contains: `SALE-${lastSale.id}` } },
    orderBy: { createdAt: 'desc' }
  });
  
  movements.forEach(m => {
    console.log(`- [${m.createdAt.toISOString()}] Tipo: ${m.type} | SKU: ${m.skuId} | Cant: ${m.quantity} | Nota: ${m.notes}`);
  });

  await prisma.$disconnect();
}

diag().catch(console.error);
