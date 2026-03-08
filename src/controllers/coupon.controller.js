const CouponService = require("../services/coupon.service");
const AuditService = require("../services/audit.service");

class CouponController {
  async create(req, res, next) {
    try {
      const coupon = await CouponService.create(req.body);

      await AuditService.logAction({
        adminId: req.user.id,
        action: "CREATE_COUPON",
        entityType: "COUPON",
        entityId: coupon.id,
        changes: req.body,
        ip: req.ip,
      });

      res.status(201).json({ success: true, data: coupon });
    } catch (error) {
      if (
        error.message.includes("ya existe") ||
        error.message.includes("already exists")
      ) {
        return res
          .status(409)
          .json({ success: false, message: "El código de cupón ya existe." });
      }
      // Errores de validación de negocio -> 400
      if (
        error.message.includes("deben tener un tope") ||
        error.message.includes("entre 0 y 100")
      ) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const coupons = await CouponService.getAllCoupons();
      res.json({ success: true, data: coupons });
    } catch (error) {
      next(error);
    }
  }

  async validate(req, res, next) {
    try {
      const { code, amount, currencyCode: bodyCurrency } = req.body;
      if (!code || !amount)
        return res
          .status(400)
          .json({ success: false, message: "Faltan datos" });

      // Prioridad: currencyCode explícito del body, fallback a detección por headers
      let currencyCode = bodyCurrency;
      if (!currencyCode) {
        const CurrencyService = require("../services/currency.service");
        currencyCode = await CurrencyService.getCurrencyByContext(req);
      }

      const userId = req.user ? req.user.id : null;
      const result = await CouponService.validateCoupon(
        code,
        parseFloat(amount),
        currencyCode,
        userId,
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const coupon = await CouponService.update(id, req.body);

      await AuditService.logAction({
        adminId: req.user.id,
        action: "UPDATE_COUPON",
        entityType: "COUPON",
        entityId: id,
        changes: req.body,
        ip: req.ip,
      });

      res.json({ success: true, data: coupon });
    } catch (error) {
      if (
        error.message.includes("already exists") ||
        error.message.includes("ya existe")
      ) {
        return res
          .status(409)
          .json({ success: false, message: "El código de cupón ya existe." });
      }
      // Errores de validación de negocio -> 400
      if (
        error.message.includes("deben tener un tope") ||
        error.message.includes("entre 0 y 100")
      ) {
        return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await CouponService.delete(id);

      await AuditService.logAction({
        adminId: req.user.id,
        action: "DELETE_COUPON",
        entityType: "COUPON",
        entityId: id,
        ip: req.ip,
      });

      res.json({ success: true, message: "Cupón eliminado" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CouponController();
