const prisma = require("../config/prisma");

class SaleLifecycleService {
    async updateSale(id, data, roleName, userId) {
        if (roleName === "CUSTOMER")
            throw new Error("Los clientes no tienen permisos para editar ventas.");
        const sale = await prisma.sale.findUnique({ where: { id: parseInt(id) } });
        if (!sale) throw new Error("La venta solicitada no existe.");

        const { paymentStatus, paymentType, deliveryStatus, deliveryType } = data;
        const updateData = {};

        if (paymentStatus || paymentType) {
            if (sale.paymentStatus !== "PENDING" && sale.paymentStatus !== "PAID")
                throw new Error("Estado de pago inválido para modificar");
            if (paymentStatus) updateData.paymentStatus = paymentStatus;
            if (paymentType) {
                const pendingReservations = await prisma.stockReservation.count({
                    where: { saleId: parseInt(id), released: false },
                });
                if (
                    pendingReservations > 0 &&
                    ["CASH", "TRANSFER", "DEBIT"].includes(paymentType) &&
                    !["CASH", "TRANSFER", "DEBIT"].includes(sale.paymentType)
                ) {
                    throw new Error(
                        "No se puede cambiar a pago offline con reservas de stock pendientes. Cancele la venta y cree una nueva.",
                    );
                }
                updateData.paymentType = paymentType;
            }
        }

        if (deliveryStatus || deliveryType) {
            const validTransitions = {
                PENDING_DELIVERY: ["SHIPPED", "DELIVERED", "CANCELLED"],
                SHIPPED: ["DELIVERED", "CANCELLED"],
                DELIVERED: [],
                CANCELLED: [],
                REQUIRES_ACTION: ["PENDING_DELIVERY", "SHIPPED", "CANCELLED"],
            };
            if (deliveryStatus) {
                const allowed = validTransitions[sale.deliveryStatus] || [];
                if (!allowed.includes(deliveryStatus)) {
                    throw new Error(
                        `No se puede cambiar de ${sale.deliveryStatus} a ${deliveryStatus}`,
                    );
                }
                updateData.deliveryStatus = deliveryStatus;
            }
            if (deliveryType) updateData.deliveryType = deliveryType;
        }

        if (Object.keys(updateData).length === 0)
            throw new Error("No se detectaron cambios permitidos.");

        if (
            (updateData.paymentStatus === "CANCELLED" ||
                updateData.paymentStatus === "REJECTED") &&
            sale.paymentStatus !== "CANCELLED" &&
            sale.paymentStatus !== "REJECTED"
        ) {
            await this.cancelSale(id, userId, roleName);
            return await prisma.sale.findUnique({ where: { id: parseInt(id) } });
        }

        const updatedSale = await prisma.sale.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                items: true,
                stockReservations: { where: { released: false } },
            },
        });

        if (updateData.paymentStatus === "PAID" && sale.paymentStatus !== "PAID") {
            await prisma.$transaction(async (tx) => {
                const freshSaleRows = await tx.$queryRaw`
                     SELECT "paymentStatus" FROM "Sale" WHERE id = ${parseInt(id)} FOR UPDATE
                 `;
                if (freshSaleRows[0]?.paymentStatus !== "PAID") return;

                for (const item of (updatedSale.items || [])) {
                    if (!item.skuId || item.quantity <= 0) continue;

                    await tx.$executeRaw`
                         UPDATE "SKU" SET stock = stock - ${item.quantity}, "soldQuantity" = "soldQuantity" + ${item.quantity}, "updatedAt" = NOW()
                         WHERE id = ${item.skuId}
                     `;
                    await tx.$executeRaw`
                         UPDATE "BranchInventory" SET stock = stock - ${item.quantity}, "soldQuantity" = "soldQuantity" + ${item.quantity}, "updatedAt" = NOW()
                         WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                     `;

                    const inv = await tx.branchInventory.findUnique({
                        where: { skuId_branchId: { skuId: item.skuId, branchId: sale.branchId } },
                    });

                    await tx.stockMovement.create({
                        data: {
                            skuId: item.skuId,
                            branchId: sale.branchId,
                            type: "SALE",
                            quantity: -Number(item.quantity),
                            resultingStock: inv ? Number(inv.stock) : 0,
                            referenceId: `SALE-${sale.id}`,
                            userId: userId,
                            notes: `Pago confirmado via updateSale - Venta #${sale.id}`,
                        },
                    });
                }

                await tx.stockReservation.updateMany({
                    where: { saleId: parseInt(id), released: false },
                    data: { released: true }
                });
            });

            const SalePaymentService = require("./sale-payment.service");
            await SalePaymentService.processPostPaymentActions(id);
        }

        return updatedSale;
    }

    async cancelSale(id, userId, roleName) {
        await prisma.$transaction(async (tx) => {
            const lockedRows = await tx.$queryRaw`
               SELECT * FROM "Sale" WHERE id = ${parseInt(id)} FOR UPDATE
           `;
            if (!lockedRows || lockedRows.length === 0)
                throw new Error("La venta a cancelar no fue encontrada.");
            const saleRow = lockedRows[0];

            if (roleName === "CUSTOMER" && saleRow.userId !== userId)
                throw new Error("No tienes permiso para cancelar esta venta.");
            if (saleRow.deliveryStatus === "DELIVERED")
                throw new Error("No se puede cancelar una venta ya entregada");
            if (saleRow.paymentStatus === "PAID" && roleName === "CUSTOMER")
                throw new Error(
                    "No puedes cancelar una orden que ya fue pagada. Por favor, contacta a soporte técnico.",
                );
            if (saleRow.paymentStatus === "CANCELLED")
                throw new Error("Esta venta ya fue cancelada.");

            const sale = await tx.sale.findUnique({
                where: { id: parseInt(id) },
                include: { items: true, stockReservations: true },
            });
            if (
                ["CASH", "TRANSFER", "DEBIT"].includes(sale.paymentType) ||
                sale.paymentStatus === "PAID"
            ) {
                for (const item of sale.items) {
                    if (item.skuId && item.quantity > 0) {
                        const inv = await tx.branchInventory.findUnique({
                            where: { skuId_branchId: { skuId: item.skuId, branchId: sale.branchId } }
                        });

                        if (inv) {
                            const currentStock = Number(inv.stock);
                            const currentCost = Number(inv.costPrice || item.unitCostBase || 0);
                            const returnQty = Number(item.quantity);
                            const returnCost = Number(item.unitCostBase || currentCost);

                            const newStockValue = currentStock + returnQty;
                            const newCostValue = newStockValue > 0 ? ((currentStock * currentCost) + (returnQty * returnCost)) / newStockValue : returnCost;

                            await tx.$executeRaw`
                             UPDATE "BranchInventory"
                             SET stock = stock + ${item.quantity},
                                 "soldQuantity" = "soldQuantity" - ${item.quantity},
                                 "costPrice" = ${newCostValue},
                                 "updatedAt" = NOW()
                             WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                         `;
                        }

                        await tx.$executeRaw`
                           UPDATE "SKU"
                           SET stock = stock + ${item.quantity},
                               "soldQuantity" = "soldQuantity" - ${item.quantity},
                               "updatedAt" = NOW()
                           WHERE id = ${item.skuId}
                       `;

                        const inventory = await tx.branchInventory.findUnique({
                            where: {
                                skuId_branchId: { skuId: item.skuId, branchId: sale.branchId },
                            },
                        });

                        await tx.stockMovement.create({
                            data: {
                                skuId: item.skuId,
                                branchId: sale.branchId,
                                type: "MANUAL_ADJUSTMENT",
                                quantity: Number(item.quantity),
                                resultingStock: inventory ? Number(inventory.stock) : 0,
                                referenceId: `CANCEL-${sale.id}`,
                                userId: userId,
                                notes: `Cancelación Venta #${sale.id}`,
                            },
                        });
                    }
                }
            }

            if (sale.stockReservations && sale.stockReservations.length > 0) {
                await tx.stockReservation.updateMany({
                    where: { saleId: sale.id, released: false },
                    data: { released: true },
                });
            }

            await tx.sale.update({
                where: { id: sale.id },
                data: {
                    paymentStatus: "CANCELLED",
                    deliveryStatus: "CANCELLED",
                    observations: sale.observations
                        ? sale.observations + " [CANCELLED]"
                        : "[CANCELLED]",
                },
            });

            const earnedPointsObj = await tx.pointsHistory.findFirst({
                where: {
                    userId: sale.userId,
                    reason: `Compra #${sale.id}`,
                    type: "EARNED",
                },
            });

            if (earnedPointsObj) {
                const alreadyRevoked = await tx.pointsHistory.findFirst({
                    where: { reason: `Revocación por Cancelación Venta #${sale.id}` },
                });

                if (!alreadyRevoked) {
                    await tx.user.update({
                        where: { id: sale.userId },
                        data: { points: { decrement: earnedPointsObj.amount } },
                    });
                    await tx.pointsHistory.create({
                        data: {
                            userId: sale.userId,
                            type: "USED",
                            amount: earnedPointsObj.amount,
                            reason: `Revocación por Cancelación Venta #${sale.id}`,
                        },
                    });
                }
            }

            if (sale.pointsUsed > 0) {
                const alreadyRefunded = await tx.pointsHistory.findFirst({
                    where: { reason: `Reembolso por Cancelación Venta #${sale.id}` },
                });

                if (!alreadyRefunded) {
                    await tx.user.update({
                        where: { id: sale.userId },
                        data: { points: { increment: sale.pointsUsed } },
                    });
                    await tx.pointsHistory.create({
                        data: {
                            userId: sale.userId,
                            type: "EARNED",
                            amount: sale.pointsUsed,
                            reason: `Reembolso por Cancelación Venta #${sale.id}`,
                        },
                    });
                }
            }
            if (sale.couponId) {
                await tx.$executeRaw`
                   UPDATE "Coupon"
                   SET "usedCount" = GREATEST("usedCount" - 1, 0)
                   WHERE id = ${sale.couponId}
               `;
            }
        }, { timeout: 20000 });

        return { success: true, message: "Venta cancelada y stock restaurado" };
    }

    async cleanupAbandonedSales() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const oneHundredNinetyTwoHoursAgo = new Date(
            Date.now() - 192 * 60 * 60 * 1000,
        );

        const abandonedSales = await prisma.sale.findMany({
            where: {
                paymentStatus: "PENDING",
                OR: [
                    {
                        createdAt: { lt: oneHourAgo },
                        paymentTransactions: {
                            none: {},
                        },
                    },
                    {
                        createdAt: { lt: oneHundredNinetyTwoHoursAgo },
                        paymentTransactions: {
                            some: {
                                status: "PROCESSING",
                            },
                        },
                    },
                ],
            },
            include: {
                stockReservations: { where: { released: false } },
            },
        });

        if (abandonedSales.length === 0) return 0;

        let cancelledCount = 0;

        for (const sale of abandonedSales) {
            await prisma.$transaction(async (tx) => {
                await tx.sale.update({
                    where: { id: sale.id },
                    data: {
                        paymentStatus: "CANCELLED",
                        observations:
                            (sale.observations || "") +
                            "\n[Auto-Cleanup] Venta abandonada cancelada automáticamente.",
                    },
                });

                if (sale.stockReservations.length > 0) {
                    await tx.stockReservation.updateMany({
                        where: { saleId: sale.id },
                        data: { released: true },
                    });
                }

                if (sale.pointsUsed > 0) {
                    const alreadyRefunded = await tx.pointsHistory.findFirst({
                        where: {
                            reason: `Reembolso automático (Venta Abandonada) #${sale.id}`,
                        },
                    });

                    if (!alreadyRefunded) {
                        await tx.user.update({
                            where: { id: sale.userId },
                            data: { points: { increment: sale.pointsUsed } },
                        });
                        await tx.pointsHistory.create({
                            data: {
                                userId: sale.userId,
                                type: "EARNED",
                                amount: sale.pointsUsed,
                                reason: `Reembolso automático (Venta Abandonada) #${sale.id}`,
                            },
                        });
                    }
                }
            });
            cancelledCount++;
        }

        return cancelledCount;
    }
}

module.exports = new SaleLifecycleService();
