const cron = require('node-cron');
const prisma = require('../config/prisma');
const BackupService = require('../services/backup.service');

const initializeBackupCron = () => {
    // Correr todos los días a las 02:00 AM para verificar si corresponde hacer backup
    cron.schedule('0 2 * * *', async () => {
        try {
            const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
            
            if (!config || !config.enableAutoBackup) {
                return;
            }

            const today = new Date();
            let shouldBackup = false;

            switch (config.backupFrequency) {
                case 'DAILY':
                    shouldBackup = true;
                    break;
                case 'WEEKLY':
                    
                    if (today.getDay() === 0) shouldBackup = true;
                    break;
                case 'MONTHLY':
                  
                    if (today.getDate() === 1) shouldBackup = true;
                    break;
            }

            if (shouldBackup) {
                console.log(`[BackupCron] Starting automatic backup... (${config.backupFrequency})`);
                await BackupService.generateBackupFolder();
             
                console.log(`[BackupCron] Automatic backup completed successfully.`);
            }

        } catch (error) {
            console.error('[BackupCron] Error during automatic backup:', error);
        }
    });

    console.log('[Cron] Configured database backup cron job.');
};

module.exports = {
    initializeBackupCron
};
