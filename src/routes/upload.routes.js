const { Router } = require('express');
const multer = require('multer');
const UploadController = require('../controllers/upload.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Todo envío de archivos requiere autenticación y rol de Admin
router.use(protect);
router.use(restrictTo('ADMIN', 'SUPER_ADMIN'));

/**
 * @route POST /api/upload
 * @desc Subir un archivo (ej: imagen local)
 * @access Admin/Super Admin
 */
router.post('/', upload.single('image'), UploadController.uploadFile);

module.exports = router;
