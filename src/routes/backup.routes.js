const express = require('express');
const router = express.Router();
const BackupController = require('../controllers/backup.controller');
const { authenticate } = require('../middlewares/auth.middleware');

/**
 * @route GET /api/backups/download-manual
 * @desc Descargar una copia de seguridad manualmente
 * @access Auth
 */
router.get('/download-manual', authenticate, BackupController.downloadManualBackup);

module.exports = router;
