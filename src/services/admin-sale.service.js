const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class AdminSaleService {
  
  /**
   * Actualiza el estado de entrega de una venta.
   */
  async updateDeliveryStatus(adminId, saleId, newStatus, ip) {
      const sale = await prisma.sale.findUnique({ where: { id: parseInt(saleId) } });
      if (!sale) throw new Error('Venta no encontrada');

      const validTransitions = {
          'PENDING_DELIVERY': ['SHIPPED', 'DELIVERED', 'CANCELLED'],
          'SHIPPED': ['DELIVERED', 'CANCELLED'],
          'DELIVERED': [],
          'CANCELLED': [],
          'REQUIRES_ACTION': ['PENDING_DELIVERY', 'SHIPPED', 'CANCELLED']
      };

      const allowed = validTransitions[sale.deliveryStatus] || [];
      if (!allowed.includes(newStatus)) {
          throw new Error(`No se puede cambiar de ${sale.deliveryStatus} a ${newStatus}`);
      }
      
      const updatedSale = await prisma.sale.update({
          where: { id: parseInt(saleId) },
          data: { deliveryStatus: newStatus }
      });

      await AuditService.logAction({
          adminId,
          action: 'UPDATE_DELIVERY_STATUS',
          entityType: 'SALE',
          entityId: saleId,
          branchId: updatedSale.branchId,
          changes: { prev: sale.deliveryStatus, new: newStatus },
          ip
      });

      return updatedSale;
  }

  /**
   * Anula una venta y devuelve el stock al inventario.
   */
  async refundSale(adminId, saleId, reason, ip) {
      if (!reason || reason.trim() === '') {
          throw new Error('Motivo de anulación es requerido');
      }

      return await prisma.$transaction(async (tx) => {
          const sale = await tx.sale.findUnique({
              where: { id: parseInt(saleId) },
              include: { items: true, user: true }
          });

          if (!sale) throw new Error('Venta no encontrada');
          if (sale.paymentStatus === 'CANCELLED') throw new Error('La venta ya está cancelada');
          if (sale.paymentStatus === 'PENDING' || sale.paymentStatus === 'REJECTED') {
              throw new Error('Las ventas no pagadas no requieren reembolso manual de inventario completo');
          }

          for (const item of sale.items) {
              const qty = Number(item.quantity);
              
              // Bloqueo de fila para evitar race conditions en stock
              const branchInventoryRows = await tx.$queryRaw`
                  SELECT id FROM "BranchInventory"
                  WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                  FOR UPDATE
              `;
              
              if (branchInventoryRows.length > 0) {
                  const biId = branchInventoryRows[0].id;
                  const invRow = await tx.branchInventory.findUnique({ where: { id: biId } });
                  
                  const currentStock = Number(invRow.stock);
                  const currentCost = Number(invRow.costPrice || item.unitCostBase || 0);
                  const returnQty = qty;
                  const returnCost = Number(item.unitCostBase || currentCost);
                  
                  const newStockVal = currentStock + returnQty;
                  const newCostVal = newStockVal > 0 ? ((currentStock * currentCost) + (returnQty * returnCost)) / newStockVal : returnCost;

                  await tx.$executeRaw`
                      UPDATE "BranchInventory"
                      SET stock = stock + ${qty},
                          "soldQuantity" = GREATEST("soldQuantity" - ${qty}, 0),
                          "costPrice" = ${newCostVal},
                          "updatedAt" = NOW()
                      WHERE id = ${biId}
                  `;
              } else {
                  await tx.branchInventory.create({
                      data: {
                          skuId: item.skuId,
                          branchId: sale.branchId,
                          stock: qty,
                          costPrice: item.unitCostBase,
                          isActive: true
                      }
                  });
              }
              
              // Actualizar Stock global del SKU
              await tx.$executeRaw`
                  UPDATE "SKU"
                  SET stock = stock + ${qty},
                      "soldQuantity" = GREATEST("soldQuantity" - ${qty}, 0),
                      "updatedAt" = NOW()
                  WHERE id = ${item.skuId}
              `;

              const updatedInv = await tx.branchInventory.findFirst({
                  where: { skuId: item.skuId, branchId: sale.branchId }
              });
              
              await tx.stockMovement.create({
                  data: {
                      skuId: item.skuId,
                      branchId: sale.branchId,
                      type: 'RETURN',
                      quantity: qty,
                      resultingStock: updatedInv ? Number(updatedInv.stock) : qty,
                      referenceId: `REFUND-${sale.id}`,
                      userId: adminId,
                      notes: `Devolución Venta #${sale.id}`
                  }
              });
          }

          // Reversión de Puntos
          let pointsReverted = 0;
          let pointsRemoved = 0;

          if (sale.pointsUsed > 0 && sale.userId) {
              const alreadyRefunded = await tx.pointsHistory.findFirst({
                  where: { reason: `Reembolso por anulación manual - Venta #${sale.id}` }
              });
              
              if (!alreadyRefunded) {
                  await tx.user.update({
                      where: { id: sale.userId },
                      data: { points: { increment: sale.pointsUsed } }
                  });
                  await tx.pointsHistory.create({
                      data: {
                          userId: sale.userId,
                          type: 'EARNED',
                          amount: sale.pointsUsed,
                          reason: `Reembolso por anulación manual - Venta #${sale.id}`
                      }
                  });
                  pointsReverted = sale.pointsUsed;
              }
          }

          // Quitar puntos ganados en la venta
          let pointsEarnedInSale = 0;
          for (const item of sale.items) {
              const sku = await tx.sKU.findUnique({
                  where: { id: item.skuId },
                  include: { product: true }
              });
              if (sku && sku.product && sku.product.pointsReward) {
                   pointsEarnedInSale += (sku.product.pointsReward * Number(item.quantity));
              }
          }

          if (pointsEarnedInSale > 0 && sale.userId) {
              const user = await tx.user.findUnique({ where: { id: sale.userId } });
              if (user && user.points >= pointsEarnedInSale) {
                  await tx.user.update({
                      where: { id: sale.userId },
                      data: { points: { decrement: pointsEarnedInSale } }
                  });
                  await tx.pointsHistory.create({
                      data: {
                          userId: sale.userId,
                          type: 'USED',
                          amount: pointsEarnedInSale,
                          reason: `Deducción por anulación de compra - Venta #${sale.id}`
                      }
                  });
                  pointsRemoved = pointsEarnedInSale;
              }
          }

          const updatedSale = await tx.sale.update({
              where: { id: sale.id },
              data: { 
                  paymentStatus: 'CANCELLED',
                  cancelReason: reason
              }
          });

          await AuditService.logAction({
              adminId,
              action: 'REFUND_SALE',
              entityType: 'SALE',
              entityId: sale.id,
              branchId: sale.branchId,
              changes: { 
                  reason, 
                  prevStatus: sale.paymentStatus, 
                  newStatus: 'CANCELLED',
                  pointsReverted,
                  pointsRemoved
              },
              ip
          });

          return updatedSale;
      }, { timeout: 20000 });
  }

  /**
   * Actualiza el estado de pago de una venta.
   */
  async updatePaymentStatus(adminId, saleId, newStatus, ip) {
      const sale = await prisma.sale.findUnique({
          where: { id: parseInt(saleId) },
          include: { items: true, stockReservations: true }
      });
      if (!sale) throw new Error('Venta no encontrada');

      const wasPending = sale.paymentStatus !== 'PAID';
      
      if (wasPending && newStatus === 'PAID') {
          // Si cambia a PAGADO, procesar deducción de stock (Lógica similar a Webhook)
          const hasMPOIntent = !!sale.mpPaymentId;
          const hasManualProof = !!sale.paymentProofUrl;
          
          if (!hasMPOIntent && !hasManualProof) {
              throw new Error('No se puede marcar como PAGADO una venta que no tiene un comprobante adjunto o un ticket de pago generado.');
          }

          await prisma.$transaction(async (tx) => {
              for (const item of (sale.items || [])) {
                  if (!item.skuId || item.quantity <= 0) continue;

                  await tx.$executeRaw`
                      UPDATE "SKU" 
                      SET stock = stock - ${item.quantity},
                          "soldQuantity" = "soldQuantity" + ${item.quantity},
                          "updatedAt" = NOW()
                      WHERE id = ${item.skuId}
                  `;
                  
                  await tx.$executeRaw`
                      UPDATE "BranchInventory"
                      SET stock = stock - ${item.quantity},
                          "soldQuantity" = "soldQuantity" + ${item.quantity},
                          "updatedAt" = NOW()
                      WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                  `;

                  const inv = await tx.branchInventory.findUnique({ 
                      where: { skuId_branchId: { skuId: item.skuId, branchId: sale.branchId } } 
                  });
                  
                  await tx.stockMovement.create({
                      data: {
                          skuId: item.skuId,
                          branchId: sale.branchId,
                          type: 'SALE',
                          quantity: -Number(item.quantity),
                          resultingStock: inv ? Number(inv.stock) : 0,
                          referenceId: `SALE-${sale.id}`,
                          userId: adminId,
                          notes: `Pago confirmado manualmente - Venta #${sale.id}`
                      }
                  });
              }

              if (sale.stockReservations && sale.stockReservations.length > 0) {
                  await tx.stockReservation.updateMany({
                      where: { saleId: sale.id, released: false },
                      data: { released: true }
                  });
              }
              await tx.sale.update({
                  where: { id: parseInt(saleId) },
                  data: { paymentStatus: newStatus }
              });
          });

          const SaleService = require('./sale.service');
          setImmediate(async () => {
              try {
                  await SaleService.processPostPaymentActions(parseInt(saleId));
              } catch (e) {
                  console.error('[AdminSaleService] Error in post-payment actions:', e);
              }
          });
      } else {
          await prisma.sale.update({
              where: { id: parseInt(saleId) },
              data: { paymentStatus: newStatus }
          });
      }

      await AuditService.logAction({
          adminId,
          action: 'UPDATE_PAYMENT_STATUS',
          entityType: 'SALE',
          entityId: saleId,
          branchId: sale.branchId,
          changes: { prev: sale.paymentStatus, new: newStatus },
          ip
      });

      return sale;
  }

  /**
   * Obtiene estadísticas para el dashboard administrativo.
   */
  async getDashboardStats(timeRange = 'month', branchId = null, branchIds = null) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate;
    let prevStartDate;
    let prevEndDate;

    // Fechas para comparación (Mes Actual vs Mes Anterior por defecto)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const filter = { paymentStatus: 'PAID' };
    
    if (branchId) {
        filter.branchId = branchId;
    } else if (branchIds && branchIds.length > 0) {
        filter.branchId = { in: branchIds };
    }

    switch (timeRange) {
        case 'today':
            startDate = todayStart;
            prevStartDate = new Date(todayStart);
            prevStartDate.setDate(prevStartDate.getDate() - 1);
            prevEndDate = new Date(todayStart);
            break;
        case 'yesterday':
            startDate = new Date(todayStart);
            startDate.setDate(startDate.getDate() - 1);
            prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - 1);
            prevEndDate = new Date(startDate);
            break;
        case 'week':
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);
            prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - 7);
            prevEndDate = new Date(startDate);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
            prevEndDate = new Date(now.getFullYear() - 1, 11, 31);
            break;
        case 'total':
            startDate = null;
            prevStartDate = null;
            prevEndDate = null;
            break;
        case 'month':
        default:
            startDate = startOfMonth;
            prevStartDate = startOfLastMonth;
            prevEndDate = endOfLastMonth;
            break;
    }

    if (startDate) {
        filter.createdAt = { gte: startDate };
    }

    // 1. Ingresos Totales (Usando totalInBaseCurrency para consistencia multi-divisa)
    const totalRevenueAgg = await prisma.sale.aggregate({
      _sum: { totalInBaseCurrency: true },
      where: filter
    });
    const totalRevenue = Number(totalRevenueAgg._sum.totalInBaseCurrency || 0);

    // 2. Crecimiento vs Periodo Anterior
    let revenueGrowth = 0;
    if (timeRange !== 'total') {
        const prevFilter = { 
            paymentStatus: 'PAID',
            createdAt: { gte: prevStartDate, lt: prevEndDate || startDate }
        };
        
        if (branchId) {
            prevFilter.branchId = branchId;
        } else if (branchIds && branchIds.length > 0) {
            prevFilter.branchId = { in: branchIds };
        }
        
        if (timeRange === 'today') {
             prevFilter.createdAt = { gte: prevStartDate, lt: startDate };
        }

        const prevRevenueAgg = await prisma.sale.aggregate({
            _sum: { totalInBaseCurrency: true },
            where: prevFilter
        });
        const prevRevenue = Number(prevRevenueAgg._sum.totalInBaseCurrency || 0);
        const currentRevenue = Number(totalRevenue);
        revenueGrowth = prevRevenue === 0 ? (currentRevenue > 0 ? 100 : 0) : ((currentRevenue - prevRevenue) / prevRevenue) * 100;
    }

    const totalSalesCount = await prisma.sale.count({ where: filter });
    const userFilter = {};
    if (startDate) userFilter.createdAt = { gte: startDate };
    userFilter.role = { name: 'CUSTOMER' };
 
    const totalUsersEver = await prisma.user.count({ where: { role: { name: 'CUSTOMER' } } });
    const newUsersPeriod = await prisma.user.count({ where: userFilter });

    const avgTicket = totalSalesCount > 0 ? Number(totalRevenue) / totalSalesCount : 0;

    // 3. Datos para Gráfico
    let chartData = [];
    const chartSales = await prisma.sale.findMany({
        where: filter,
        select: { createdAt: true, totalInBaseCurrency: true }
    });

    const revenueByTime = {};
    chartSales.forEach(sale => {
        let key;
        const d = sale.createdAt;
        if (timeRange === 'today') {
            key = d.getHours() + ':00';
        } else if (timeRange === 'year') {
            key = d.toLocaleString('es-ES', { month: 'short' });
        } else {
            key = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }
        revenueByTime[key] = (revenueByTime[key] || 0) + Number(sale.totalInBaseCurrency || 0);
    });
    chartData = Object.keys(revenueByTime).map(name => ({ name, total: revenueByTime[name] }));

    // 4. Métodos de Pago
    const paymentMethods = await prisma.sale.groupBy({
      by: ['paymentType'],
      _count: { id: true },
      _sum: { totalInBaseCurrency: true },
      where: filter
    });

    const paymentMethodsData = paymentMethods.map(pm => ({
      name: pm.paymentType,
      value: Number(pm._sum.totalInBaseCurrency || 0),
      count: pm._count.id
    }));

    // 5. Productos más vendidos
    const topProductsRaw = await prisma.saleItem.groupBy({
      by: ['productName'],
      _sum: { quantity: true, subtotalInBaseCurrency: true },
      where: {
          sale: filter
      },
      orderBy: { _sum: { subtotalInBaseCurrency: 'desc' } },
      take: 5
    });

    const topProducts = topProductsRaw.map(p => ({
      name: p.productName,
      sales: Number(p._sum.quantity || 0),
      revenue: Number(p._sum.subtotalInBaseCurrency || 0)
    }));

    // 6. Mejores Clientes
    const topUsersRaw = await prisma.sale.groupBy({
      by: ['userId'],
      _count: { id: true },
      _sum: { totalInBaseCurrency: true },
      where: filter,
      orderBy: { _sum: { totalInBaseCurrency: 'desc' } },
      take: 5
    });

    const topUsers = await Promise.all(topUsersRaw.map(async (u) => {
        const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { name: true, email: true } });
        return {
            name: user?.name || user?.email || 'Anónimo',
            orders: u._count.id,
            totalSpent: Number(u._sum.totalInBaseCurrency || 0)
        };
    }));

    return {
        totalRevenue,
        revenueGrowth,
        totalSalesCount,
        newUsersPeriod,
        avgTicket,
        chartData,
        paymentMethods: paymentMethodsData,
        topProducts,
        topUsers
    };
  }
}

module.exports = new AdminSaleService();
