const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConfig() {
  const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
  console.log('--- STORE CONFIG ---');
  console.log(JSON.stringify(config, null, 2));
  await prisma.$disconnect();
}

checkConfig().catch(console.error);
