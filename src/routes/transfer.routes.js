const { Router } = require('express');
const multer = require('multer');
const TransferController = require('../controllers/transfer.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Todas las rutas de transferencias requieren autenticación
router.use(protect);

/**
 * @route POST /api/transfers
 * @desc Crear un reporte de transferencia bancaria comprobante
 * @access Privado
 */
router.post('/', upload.single('image'), TransferController.createTransfer);

/**
 * @route GET /api/transfers/my
 * @desc Obtener transferencias propias
 * @access Privado
 */
router.get('/my', TransferController.getMyTransfers);

/**
 * @route GET /api/transfers
 * @desc Obtener todas las transferencias bancarias
 * @access Admin/Employee
 */
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'EMPLOYEE'), TransferController.getAllTransfers);

/**
 * @route PATCH /api/transfers/:id
 * @desc Actualizar el estado de una transferencia (aprobar/rechazar)
 * @access Admin/Employee
 */
router.patch('/:id', restrictTo('ADMIN', 'SUPER_ADMIN','EMPLOYEE'), TransferController.updateTransferStatus);

module.exports = router;
