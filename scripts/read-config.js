const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.storeConfig.findFirst().then(c => {
  console.log('---CONFIG---');
  console.log(JSON.stringify(c, null, 2));
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
