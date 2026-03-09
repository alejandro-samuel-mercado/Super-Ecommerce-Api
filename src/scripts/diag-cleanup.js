const prisma = require('../config/prisma');

async function diag() {


  const recentSales = await prisma.sale.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      stockReservations: true,
      user: { select: { name: true, points: true } }
    }
  });

  recentSales.forEach(s => {
    s.stockReservations.forEach(r => {
      console.log(`    * ID ${r.id}: released=${r.released}, expiresAt=${r.expiresAt.toISOString()}`);
    });
  });

  const orphanedReservations = await prisma.stockReservation.count({
    where: { released: false, expiresAt: { lt: new Date() } }
  });


  await prisma.$disconnect();
}

diag().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
