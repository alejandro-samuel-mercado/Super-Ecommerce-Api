const prisma = require('../config/prisma');

async function testPoints() {
  const userId = 5; // Esteban Montiel
  
  console.log('--- TEST DE INCREMENTO DE PUNTOS ---');
  
  const userBefore = await prisma.user.findUnique({ where: { id: userId } });
  const pointsBefore = Number(userBefore.points);
  console.log(`Puntos antes: ${pointsBefore}`);

  const amount = 50;
  console.log(`Simulando incremento de ${amount} puntos...`);
  
  await prisma.user.update({
    where: { id: userId },
    data: { points: { increment: amount } }
  });

  const userAfter = await prisma.user.findUnique({ where: { id: userId } });
  const pointsAfter = Number(userAfter.points);
  console.log(`Puntos después: ${pointsAfter}`);

  if (pointsAfter === pointsBefore + amount) {
    console.log('✅ El incremento funcionó correctamente (Sumó).');
  } else if (pointsAfter === amount) {
    console.log('❌ El incremento SOBREESCRIBIÓ el valor (Puso el monto directamente).');
  } else {
    console.log('❌ Resultado inesperado.');
  }

  // Restaurar puntos
  await prisma.user.update({
    where: { id: userId },
    data: { points: pointsBefore }
  });
  
  await prisma.$disconnect();
}

testPoints().catch(console.error);
