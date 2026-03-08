const { Router } = require("express");
const { body } = require("express-validator");
const CouponController = require("../controllers/coupon.controller");
const {
  protect,
  restrictTo,
  optionalProtect,
} = require("../middlewares/auth.middleware");
const { validateRequest } = require("../middlewares/validate.middleware");

const router = Router();

/**
 * @route POST /api/coupons/validate
 * @desc Validar un cupón y calcular descuento
 * @access Público/Cliente
 */
router.post(
  "/validate",
  optionalProtect,
  [
    body("code").notEmpty().withMessage("El código es obligatorio"),
    body("amount").isNumeric().withMessage("El monto debe ser un número"),
    validateRequest,
  ],
  CouponController.validate,
);

// Rutas protegidas
router.use(protect);

/**
 * @route GET /api/coupons
 * @desc Obtener todos los cupones
 * @access Admin/Employee
 */
router.get(
  "/",
  restrictTo(["ADMIN", "SUPER_ADMIN", "EMPLOYEE"]),
  CouponController.getAll,
);

// Gestor: Solo Admin, Super Admin (Empleados solo pueden ver)
router.use(restrictTo(["ADMIN", "SUPER_ADMIN"]));

/**
 * @route POST /api/coupons
 * @desc Crear un nuevo cupón
 * @access Admin/Super Admin
 */
router.post(
  "/",
  [
    body("code").notEmpty().withMessage("El código es obligatorio"),
    body("type")
      .isIn(["PERCENTAGE", "FIXED"])
      .withMessage("Tipo inválido (PERCENTAGE | FIXED)"),
    body("value").isNumeric().withMessage("El valor debe ser numérico"),
    validateRequest,
  ],
  CouponController.create,
);

/**
 * @route PUT /api/coupons/:id
 * @desc Actualizar un cupón existente
 * @access Admin/Super Admin
 */
router.put(
  "/:id",
  [
    body("code").optional().notEmpty(),
    body("type").optional().isIn(["PERCENTAGE", "FIXED"]),
    body("value").optional().isNumeric(),
    validateRequest,
  ],
  CouponController.update,
);

/**
 * @route DELETE /api/coupons/:id
 * @desc Eliminar un cupón
 * @access Admin/Super Admin
 */
router.delete("/:id", CouponController.delete);

module.exports = router;
