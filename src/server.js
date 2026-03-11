require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');


require('./scripts/cleanup-cron');
const { initializeBackupCron } = require('./cron/backup.cron');
initializeBackupCron();

const PORT = process.env.PORT || 3000;

const http = require('http');
const { initSocket } = require('./socket');

async function main() {
  try {
    await prisma.$connect();
    
    
    const server = http.createServer(app);
    
    // Inicializar Socket.io
    initSocket(server);
    
    server.listen(PORT, () => {
       console.log(`Servidor corriendo en el puerto ${PORT}`);
    
    });
  } catch (error) {
    console.error('Error crítico al iniciar el servidor:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
