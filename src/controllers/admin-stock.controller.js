const prisma = require("../config/prisma");
const StockCleanupService = require("../services/stock-cleanup.service");
const AuditService = require("../services/audit.service");

/**
 * Controlador de Administración de Stock
 * Provee endpoints de monitoreo para reservas de stock e inconsistencias
 */
class AdminStockController {
  /**
   * Obtener estadísticas de reservas de stock
   * GET /api/admin/stock/reservations/stats
   */
  async getReservationStats(req, res, next) {
    try {
      const stats = await StockCleanupService.getReservationStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener reservas de stock activas
   * GET /api/admin/stock/reservations
   */
  async getActiveReservations(req, res, next) {
    try {
      const reservations = await prisma.stockReservation.findMany({
        where: { released: false },
        include: {
          sku: {
            include: { product: true },
          },
          sale: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { expiresAt: "asc" },
      });

      const now = new Date();
      const enriched = reservations.map((r) => ({
        ...r,
        isExpired: r.expiresAt < now,
        timeRemaining: Math.max(0, (r.expiresAt - now) / 1000 / 60),
      }));

      res.json({
        success: true,
        data: {
          total: enriched.length,
          expired: enriched.filter((r) => r.isExpired).length,
          active: enriched.filter((r) => !r.isExpired).length,
          reservations: enriched,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener inconsistencias potenciales de stock
   * GET /api/admin/stock/inconsistencies
   */
  async getStockInconsistencies(req, res, next) {
    try {
      const skus = await prisma.sKU.findMany({
        include: {
          product: true,
          reservations: {
            where: { released: false },
          },
        },
      });

      const issues = [];

      for (const sku of skus) {
        const totalReserved = sku.reservations.reduce(
          (sum, r) => sum + r.quantity,
          0,
        );
        const availableStock = sku.stock - totalReserved;

        if (sku.stock < 0) {
          issues.push({
            type: "NEGATIVE_STOCK",
            severity: "CRITICAL",
            skuId: sku.id,
            skuCode: sku.code,
            productName: sku.product.name,
            stock: sku.stock,
            message: `SKU tiene stock negativo: ${sku.stock}`,
          });
        }

        if (availableStock < 0) {
          issues.push({
            type: "OVER_RESERVED",
            severity: "HIGH",
            skuId: sku.id,
            skuCode: sku.code,
            productName: sku.product.name,
            stock: sku.stock,
            totalReserved: totalReserved,
            availableStock: availableStock,
            message: `Stock sobre-reservado. Stock: ${sku.stock}, Reservado: ${totalReserved}, Disponible: ${availableStock}`,
          });
        }

        if (sku.stock === 0 && totalReserved > 0) {
          issues.push({
            type: "ZERO_STOCK_WITH_RESERVATIONS",
            severity: "MEDIUM",
            skuId: sku.id,
            skuCode: sku.code,
            productName: sku.product.name,
            totalReserved: totalReserved,
            message: `SKU sin stock pero tiene ${totalReserved} unidades reservadas`,
          });
        }
      }

      res.json({
        success: true,
        data: {
          totalIssues: issues.length,
          critical: issues.filter((i) => i.severity === "CRITICAL").length,
          high: issues.filter((i) => i.severity === "HIGH").length,
          medium: issues.filter((i) => i.severity === "MEDIUM").length,
          issues: issues.sort((a, b) => {
            const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forzar limpieza de reservas expiradas (trigger manual)
   * POST /api/admin/stock/cleanup
   */
  async forceCleanup(req, res, next) {
    try {
      const cleaned = await StockCleanupService.cleanupExpiredReservations();

      res.json({
        success: true,
        message: `Se limpiaron ${cleaned} reservas expiradas`,
        data: { cleanedCount: cleaned },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtener historial de transacciones de pago (para depurar webhooks)
   * GET /api/admin/stock/payment-transactions
   */
  async getPaymentTransactions(req, res, next) {
    try {
      const { status, saleId } = req.query;

      const where = {};
      if (status) where.status = status;
      if (saleId) where.saleId = parseInt(saleId);

      const transactions = await prisma.paymentTransaction.findMany({
        where,
        include: {
          sale: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      res.json({
        success: true,
        data: {
          total: transactions.length,
          transactions: transactions.map((t) => ({
            ...t,
            duplicateAttempts: t.attempts > 1,
            processingTime: t.processedAt
              ? (new Date(t.processedAt) - new Date(t.createdAt)) / 1000
              : null,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forzar liberación de una reserva específica (admin override)
   * POST /api/admin/stock/reservations/:id/release
   */
  async releaseReservation(req, res, next) {
    try {
      const { id } = req.params;

      const result = await StockCleanupService.forceReleaseReservation(id);

      res.json({
        success: true,
        message: result.message,
        data: result.reservation,
      });
    } catch (error) {
      if (error.message.includes("not found")) {
        return res.status(404).json({ success: false, message: error.message });
      }
      next(error);
    }
  }
  /**
   * Obtener Inventario para una sucursal específica
   * GET /api/admin/stock/inventory
   */
  async getInventory(req, res, next) {
    try {
      let parsedBranchId = Number(req.query.branchId);

      if (!req.query.branchId || isNaN(parsedBranchId) || parsedBranchId <= 0) {
        const defaultBranch =
          (await prisma.branch.findFirst({
            where: { isHeadquarters: true },
          })) || (await prisma.branch.findFirst());

        if (!defaultBranch) {
          return res
            .status(400)
            .json({
              success: false,
              message: "No hay sucursales configuradas en el sistema",
            });
        }
        parsedBranchId = defaultBranch.id;
      }

      const { search, categoryId, supplierId, brand, lowStock, stockLevel } =
        req.query;

      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const lowThreshold = config?.lowStockThreshold ?? 10;
      const criticalThreshold = config?.criticalStockThreshold ?? 5;

      const skuWhere = {
        active: true,
      };

      if (search || brand || categoryId || supplierId) {
        if (search) {
          skuWhere.OR = [
            { code: { contains: search, mode: "insensitive" } },
            { product: { name: { contains: search, mode: "insensitive" } } },
          ];
        }

        if (brand || categoryId) {
          skuWhere.product = skuWhere.product || {};
          if (brand)
            skuWhere.product.brand = { contains: brand, mode: "insensitive" };
          if (categoryId) skuWhere.product.categoryId = parseInt(categoryId);
        }

        if (supplierId) {
          skuWhere.supplierSkus = {
            some: { supplierId: parseInt(supplierId) },
          };
        }
      }

      const skus = await prisma.sKU.findMany({
        where: skuWhere,
        include: {
          product: {
            include: {
              category: { select: { name: true } },
            },
          },
          variantOptions: true,
          branchInventory: {
            where: { branchId: parsedBranchId },
          },
        },
        orderBy: { product: { name: "asc" } },
      });

      let data = skus.map((sku) => {
        const inv = sku.branchInventory[0];
        const stock = inv ? parseFloat(inv.stock.toString()) : 0;
        const minStock = inv ? parseFloat(inv.minStock.toString()) : 0;

        return {
          id: inv ? inv.id : `NEW-${sku.id}`,
          skuId: sku.id,
          skuCode: sku.code,
          productName: sku.product.name,
          brand: sku.product.brand || null,
          categoryName: sku.product.category.name,
          image: sku.product.images[0] || null,
          variant: sku.variantOptions
            .map((v) => `${v.name}: ${v.value}`)
            .join(", "),
          stock,
          minStock,
          price: sku.price,
          measurementUnit: sku.product.measurementUnit || "UNIDAD",
          allowFractional: sku.product.allowFractional || false,
          updatedAt: inv ? inv.updatedAt : sku.updatedAt,
        };
      });

      if (stockLevel === "CRITICAL" || lowStock === "true") {
        data = data.filter((item) => item.stock <= criticalThreshold);
      } else if (stockLevel === "LOW") {
        data = data.filter((item) => item.stock <= lowThreshold);
      }

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualizar Stock de Inventario
   * PUT /api/admin/stock/inventory/:id
   */
  async updateInventory(req, res, next) {
    try {
      const { id } = req.params;
      const { stock, minStock, price } = req.body;
      let parsedBranchId = Number(req.query.branchId);

      // Handle missing or invalid branchId like in getInventory
      if (!req.query.branchId || isNaN(parsedBranchId) || parsedBranchId <= 0) {
        const defaultBranch =
          (await prisma.branch.findFirst({
            where: { isHeadquarters: true },
          })) || (await prisma.branch.findFirst());

        if (!defaultBranch) {
          return res.status(400).json({
            success: false,
            message: "No hay sucursales configuradas en el sistema",
          });
        }
        parsedBranchId = defaultBranch.id;
      }

      const data = {};
      if (stock !== undefined) data.stock = parseFloat(stock);
      if (minStock !== undefined) data.minStock = parseFloat(minStock);
      if (price !== undefined) data.price = parseFloat(price);

      const updated = await prisma.$transaction(async (tx) => {
        let existing;
        let targetSkuId;
        let targetBranchId;

        if (isNaN(parseInt(id))) {
          // Si el ID no es numérico (ej: "NEW-7"), indica que no existe el registro de inventario
          targetSkuId = parseInt(id.replace("NEW-", ""));
          targetBranchId = parsedBranchId;

          existing = await tx.branchInventory.findFirst({
            where: { skuId: targetSkuId, branchId: targetBranchId },
          });
        } else {
          existing = await tx.branchInventory.findUnique({
            where: { id: parseInt(id) },
          });
          if (existing) {
            targetSkuId = existing.skuId;
            targetBranchId = existing.branchId;
          }
        }

        let updatedInventory;
        const currentStock = existing
          ? parseFloat(existing.stock.toString())
          : 0;

        if (!existing) {
          if (targetSkuId === undefined)
            throw new Error("Información de SKU inválida");

          const sku = await tx.sKU.findUnique({ where: { id: targetSkuId } });
          if (!sku) throw new Error("SKU no encontrado");

          updatedInventory = await tx.branchInventory.create({
            data: {
              skuId: targetSkuId,
              branchId: targetBranchId,
              stock: stock !== undefined ? parseFloat(stock) : 0,
              minStock: minStock !== undefined ? parseFloat(minStock) : 0,
              price: price !== undefined ? parseFloat(price) : sku.price,
              costPrice: sku.price,
            },
            include: {
              sku: { include: { product: true } },
              branch: true,
            },
          });
        } else {
          updatedInventory = await tx.branchInventory.update({
            where: { id: existing.id },
            data,
            include: {
              sku: { include: { product: true } },
              branch: true,
            },
          });
        }

        if (stock !== undefined && parseFloat(stock) !== currentStock) {
          const diff = parseFloat(stock) - currentStock;
          await tx.stockMovement.create({
            data: {
              skuId: targetSkuId,
              branchId: targetBranchId,
              type: "MANUAL_ADJUSTMENT",
              quantity: diff,
              resultingStock: parseFloat(stock),
              referenceId: `MANUAL-${Date.now()}`,
              userId: req.user.id,
              notes: `Ajuste manual de stock: ${currentStock} -> ${stock}`,
            },
          });

          await tx.sKU.update({
            where: { id: targetSkuId },
            data: { stock: { increment: diff } },
          });

          await AuditService.logAction({
            adminId: req.user.id,
            action: "UPDATE_INVENTORY",
            entityType: "STOCK",
            entityId: updatedInventory.id.toString(),
            changes: { prevStock: currentStock, newStock: stock, diff },
            ip: req.ip,
          });
        }

        return updatedInventory;
      });

      res.json({
        success: true,
        data: updated,
        message: "Inventario actualizado correctamente",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminStockController();
