const prisma = require('../config/prisma');

async function diag() {
  console.log('--- DIAGNÓSTICO DE PUNTOS ---');
  
  const user = await prisma.user.findFirst({
    where: { name: 'Esteban Montiel' },
    include: {
      pointsHistory: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!user) {
    console.log('Usuario no encontrado.');
    return;
  }

  console.log(`Usuario: ${user.name} (ID: ${user.id})`);
  console.log(`Puntos actuales: ${user.points}`);
  console.log('\nÚltimos 10 movimientos de puntos:');
  user.pointsHistory.forEach(h => {
    console.log(`- [${h.createdAt.toISOString()}] ${h.type}: ${h.amount} | Razón: ${h.reason}`);
  });

  console.log('\nBuscando ventas PENDING sin reservas pero con puntos:');
  const pendingWithPoints = await prisma.sale.findMany({
    where: {
      paymentStatus: 'PENDING',
      pointsUsed: { gt: 0 },
      stockReservations: {
        none: {}
      }
    }
  });

  console.log(`Encontradas ${pendingWithPoints.length} ventas.`);
  pendingWithPoints.forEach(s => {
    console.log(`- Venta #${s.id}: Puntos ${s.pointsUsed}, Created ${s.createdAt.toISOString()}`);
  });

  await prisma.$disconnect();
}

diag().catch(console.error);
