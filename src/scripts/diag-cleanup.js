const prisma = require('../config/prisma');

async function diag() {
  console.log('--- DIAGNÓSTICO PROFUNDO ---');
  console.log('Hora actual:', new Date().toISOString());

  const recentSales = await prisma.sale.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      stockReservations: true,
      user: { select: { name: true, points: true } }
    }
  });

  console.log(`\nÚltimas 5 ventas:`);
  recentSales.forEach(s => {
    console.log(`- Venta #${s.id} (${s.createdAt.toISOString()}):`);
    console.log(`  Status: ${s.paymentStatus} | Puntos usados: ${s.pointsUsed}`);
    console.log(`  Usuario: ${s.user?.name} (Puntos actuales: ${s.user?.points})`);
    console.log(`  Reservas (${s.stockReservations.length}):`);
    s.stockReservations.forEach(r => {
      console.log(`    * ID ${r.id}: released=${r.released}, expiresAt=${r.expiresAt.toISOString()}`);
    });
  });

  const orphanedReservations = await prisma.stockReservation.count({
    where: { released: false, expiresAt: { lt: new Date() } }
  });
  console.log(`\nReservas expiradas pendientes de liberación (global): ${orphanedReservations}`);

  await prisma.$disconnect();
}

diag().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
