const prisma = require('./config/prisma');
async function main() {
  const roles = await prisma.role.findMany();
  console.log('ROLES:', JSON.stringify(roles));
}
main().catch(console.error).finally(() => prisma.$disconnect());
