const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');
const { Prisma } = require('@prisma/client');
const archiver = require('archiver');

class BackupService {
    constructor() {
        this.backupsDir = path.join(process.cwd(), 'Backups');
        if (!fs.existsSync(this.backupsDir)) {
            fs.mkdirSync(this.backupsDir, { recursive: true });
        }
    }

    /**
     * Extrae todas las tablas de la base de datos a formato JSON
     * @returns {Promise<string>} La ruta al directorio con todos los JSON
     */
    async generateBackupFolder() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `backup_${timestamp}`;
        const folderPath = path.join(this.backupsDir, folderName);
        
        fs.mkdirSync(folderPath, { recursive: true });

        // Obtener la lista dinámica de todos los modelos
        // Prisma.dmmf.datamodel.models contiene la metadata de todas las tablas
        const models = Prisma.dmmf.datamodel.models;
        
        for (const model of models) {
            const modelName = model.name;
            // Para poder llamar a prisma.modelName, prisma pone la primera letra en minúscula
            const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
            
            try {
                if (prisma[delegateName] && typeof prisma[delegateName].findMany === 'function') {
                    const data = await prisma[delegateName].findMany();
                    const filePath = path.join(folderPath, `${modelName}.json`);
                    
                    // Convertimos a string y protegemos referencias circulares si las hubiera
                    const jsonContent = JSON.stringify(data, (key, value) => {
                         return typeof value === 'bigint' ? value.toString() : value;
                    }, 2);

                    fs.writeFileSync(filePath, jsonContent);
                }
            } catch (error) {
                console.error(`[BackupService] Failed to backup table ${modelName}:`, error.message);
            }
        }

        return folderPath;
    }

    /**
     * Genera un backup y lo envuelve en un archivo ZIP. Útil para descargas manuales.
     * @returns {Promise<string>} Ruta al archivo zip
     */
    async generateBackupZip() {
        return new Promise(async (resolve, reject) => {
            try {
                const folderPath = await this.generateBackupFolder();
                const zipPath = `${folderPath}.zip`;
                
                const output = fs.createWriteStream(zipPath);
                const archive = archiver('zip', {
                    zlib: { level: 9 }
                });

                output.on('close', () => {
                    // Una vez terminado el ZIP, se puede borrar o dejar la carpeta temporal.
                  
                   fs.rmSync(folderPath, { recursive: true, force: true });
                    resolve(zipPath);
                });

                archive.on('error', (err) => {
                    reject(err);
                });

                archive.pipe(output);
                archive.directory(folderPath, path.basename(folderPath));
                await archive.finalize();
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = new BackupService();
