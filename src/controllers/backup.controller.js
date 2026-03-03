const path = require('path');
const fs = require('fs');
const BackupService = require('../services/backup.service');
const prisma = require('../config/prisma');

const downloadManualBackup = async (req, res, next) => {
    try {
        const { role } = req.user;
        const roleName = role?.name || role;
        
        if (roleName !== 'SUPER_ADMIN' && roleName !== 'ADMIN') {
            return res.status(403).json({ error: 'Permisos insuficientes para realizar backups.' });
        }

        const zipPath = await BackupService.generateBackupZip();
        
        const stat = fs.statSync(zipPath);

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename=${path.basename(zipPath)}`,
            'Content-Length': stat.size
        });

        const readStream = fs.createReadStream(zipPath);
        readStream.pipe(res);

        readStream.on('end', () => {
            
        });

    } catch (error) {
        console.error('[BackupController] Error generating manual backup:', error);
        res.status(500).json({ error: 'Error del servidor al generar la copia de seguridad.', message: error.message });
    }
};

module.exports = {
    downloadManualBackup
};
