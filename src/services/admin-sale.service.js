const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class AdminSaleService {

  // Transiciones validas
  // PENDING -> PAID | CANCELLED
  // PAID -> SHIPPED | DELIVERED | CANCELLED (Refund needed)
  // SHIPPED -> DELIVERED | CANCELLED (Refund needed)
  
  async updateDeliveryStatus(adminId, saleId, newStatus, ip) {
      const sale = await prisma.sale.findUnique({ where: { id: parseInt(saleId) } });
      if (!sale) throw new Error('Venta no encontrada');

      // Validar transición (Simple)
      if (sale.deliveryStatus === 'DELIVERED') {
          throw new Error('No se puede cambiar el estado de una venta entregada');
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
          changes: { prev: sale.deliveryStatus, new: newStatus },
          ip
      });

      return updatedSale;
  }

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
              
              const branchInventoryRows = await tx.$queryRaw`
                  SELECT id FROM "BranchInventory"
                  WHERE "skuId" = ${item.skuId} AND "branchId" = ${sale.branchId}
                  FOR UPDATE
              `;
              
              if (branchInventoryRows.length > 0) {
                  const biId = branchInventoryRows[0].id;
                  await tx.$executeRaw`
                      UPDATE "BranchInventory"
                      SET stock = stock + ${qty},
                          "soldQuantity" = "soldQuantity" - ${qty},
                          "updatedAt" = NOW()
                      WHERE id = ${biId}
                  `;
              }
              
              await tx.$executeRaw`
                  UPDATE "SKU"
                  SET stock = stock + ${qty},
                      "soldQuantity" = "soldQuantity" - ${qty},
                      "updatedAt" = NOW()
                  WHERE id = ${item.skuId}
              `;
              
              await tx.stockMovement.create({
                  data: {
                      skuId: item.skuId,
                      branchId: sale.branchId,
                      type: 'RETURN',
                      quantity: qty,
                      resultingStock: branchInventoryRows.length > 0 
                          ? (await tx.branchInventory.findUnique({ where: { id: branchInventoryRows[0].id } }))?.stock || 0 
                          : 0,
                      referenceId: `REFUND-${sale.id}`,
                      userId: adminId,
                      notes: `Devolución Venta #${sale.id}`
                  }
              });
          }

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
              const alreadyRemoved = await tx.pointsHistory.findFirst({
                  where: { reason: `Reversión de puntos ganados por anulación manual - Venta #${sale.id}` }
              });
              
              if (!alreadyRemoved) {
                  const userCurrent = await tx.user.findUnique({ where: { id: sale.userId } });
                  const amountToRemove = Math.min(pointsEarnedInSale, userCurrent.points || 0);
                  
                  if (amountToRemove > 0) {
                      await tx.user.update({
                          where: { id: sale.userId },
                          data: { points: { decrement: amountToRemove } }
                      });
                      await tx.pointsHistory.create({
                          data: {
                              userId: sale.userId,
                              type: 'USED',
                              amount: amountToRemove,
                              reason: `Reversión de puntos ganados por anulación manual - Venta #${sale.id}`
                          }
                      });
                      pointsRemoved = amountToRemove;
                  }
              }
          }

          const newObservations = sale.observations 
              ? `${sale.observations} | ANULACIÓN: ${reason}` 
              : `ANULACIÓN: ${reason}`;

          const updatedSale = await tx.sale.update({
              where: { id: parseInt(saleId) },
              data: { 
                  paymentStatus: 'CANCELLED',
                  deliveryStatus: 'CANCELLED',
                  observations: newObservations
              }
          });

          await AuditService.logAction({
              adminId,
              action: 'REFUND_SALE',
              entityType: 'SALE',
              entityId: saleId,
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
      });
  }

  async updatePaymentStatus(adminId, saleId, newStatus, ip) {
      const sale = await prisma.sale.findUnique({
          where: { id: parseInt(saleId) },
          include: { items: true, stockReservations: true }
      });
      if (!sale) throw new Error('Venta no encontrada');

      const wasPending = sale.paymentStatus !== 'PAID';

      if (wasPending && newStatus === 'PAID') {
          await prisma.$transaction(async (tx) => {
              for (const reservation of (sale.stockReservations || [])) {
                  if (reservation.released) continue;
                  await tx.$executeRaw`
                      UPDATE "SKU" 
                      SET stock = stock - ${reservation.quantity},
                          "soldQuantity" = "soldQuantity" + ${reservation.quantity},
                          "updatedAt" = NOW()
                      WHERE id = ${reservation.skuId}
                  `;
                  await tx.$executeRaw`
                      UPDATE "BranchInventory"
                      SET stock = stock - ${reservation.quantity},
                          "soldQuantity" = "soldQuantity" + ${reservation.quantity},
                          "updatedAt" = NOW()
                      WHERE id = ${reservation.branchInventoryId}
                  `;
                  const inv = await tx.branchInventory.findUnique({ where: { id: reservation.branchInventoryId } });
                  await tx.stockMovement.create({
                      data: {
                          skuId: reservation.skuId,
                          branchId: sale.branchId,
                          type: 'SALE',
                          quantity: -Number(reservation.quantity),
                          resultingStock: inv ? Number(inv.stock) : 0,
                          referenceId: `SALE-${sale.id}`,
                          userId: adminId,
                          notes: `Pago confirmado manualmente - Venta #${sale.id}`
                      }
                  });
                  await tx.stockReservation.update({
                      where: { id: reservation.id },
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
          changes: { prev: sale.paymentStatus, new: newStatus },
          ip
      });

      return await prisma.sale.findUnique({ where: { id: parseInt(saleId) } });
  }
  async getDashboardStats(timeRange = 'month', branchId = null) {
    const now = new Date();
    // Inicio del día actual (00:00:00)
    const todayStart = new Date(now.setHours(0,0,0,0));
    
    // Calcular startDate basado en rango
    let startDate;
    let prevStartDate;
    let prevEndDate;

    // Fechas para lógica de comparación "Mes Anterior" (por defecto)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const filter = { paymentStatus: 'PAID' };
    
    // Agregar filtro de sucursal si se especifica
    if (branchId) {
        filter.branchId = branchId;
    }

    switch (timeRange) {
        case 'today':
            startDate = todayStart;
            // Comparar vs ayer
            prevStartDate = new Date(todayStart);
            prevStartDate.setDate(prevStartDate.getDate() - 1);
            prevEndDate = new Date(todayStart);
            break;
        case 'week':
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);


            // Comparar vs semana anterior
            prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - 7);
            prevEndDate = new Date(startDate);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            // Comparar vs año anterior
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

    // 1. Ingresos Totales (Filtrado) - Usar totalInBaseCurrency para consolidación real
    const totalRevenueAgg = await prisma.sale.aggregate({
      _sum: { totalInBaseCurrency: true },
      where: filter
    });
    const totalRevenue = Number(totalRevenueAgg._sum.totalInBaseCurrency || 0);


    // 2. Crecimiento de Ingresos (Vs Periodo Anterior)
    // Solo significativo si comparamos periodos similares, 'total' no tiene crecimiento
    let revenueGrowth = 0;
    if (timeRange !== 'total') {
        const prevFilter = { 
            paymentStatus: 'PAID',
            createdAt: { gte: prevStartDate, lt: prevEndDate || startDate }
        };
        
        // Agregar filtro de sucursal al periodo anterior también
        if (branchId) {
            prevFilter.branchId = branchId;
        }
        
        // Caso especial para hoy/semana se podría necesitar manejo preciso, pero aprox está bien
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

    // 3. Conteo de Ventas (Filtrado)
    const totalSalesCount = await prisma.sale.count({ where: filter });
    const currentSalesCount = totalSalesCount;

    // 4. Clientes Activos (Nuevos Clientes en Periodo)
   
    const userFilter = {};
    if (startDate) userFilter.createdAt = { gte: startDate };
    userFilter.role = { name: 'CUSTOMER' };
 
    const totalUsersEver = await prisma.user.count({ where: { role: { name: 'CUSTOMER' } } });
    const newUsersPeriod = await prisma.user.count({ where: userFilter });

    // 5. Ticket Promedio
    const avgTicket = totalSalesCount > 0 ? Number(totalRevenue) / totalSalesCount : 0;

    // 6. Gráfico de Ingresos

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


    // 7. Desglose Métodos de Pago (Filtrado)
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

    // 8. Productos Top (Filtrado)
    
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

    // 9. Usuarios Top (Filtrado)
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
        name: user ? user.name : `Usuario #${u.userId}`,
        email: user ? user.email : '',
        salesCount: u._count.id,
        revenue: Number(u._sum.totalInBaseCurrency || 0)
      };
    }));

    // 10. Empleados Top (Filtrado)
    const topEmployeesRaw = await prisma.sale.groupBy({
      by: ['employeeId'],
      _count: { id: true },
      _sum: { totalInBaseCurrency: true },
      where: { ...filter, employeeId: { not: null } },
      orderBy: { _sum: { totalInBaseCurrency: 'desc' } },
      take: 5
    });

    const topEmployees = await Promise.all(topEmployeesRaw.map(async (e) => {
       if (!e.employeeId) return null;
       const user = await prisma.user.findUnique({ where: { id: e.employeeId }, select: { name: true } });
       return {
         name: user ? user.name : `Empleado #${e.employeeId}`,
         salesCount: e._count.id,
         revenue: Number(e._sum.totalInBaseCurrency || 0)
       };
    }));

    return {
      totalRevenue: Number(totalRevenue),
      revenueGrowth,
      salesCount: currentSalesCount,
      newUsers: newUsersPeriod,
      totalUsers: totalUsersEver,
      avgTicket,
      chartData,
      paymentMethodsData,
      topProducts,
      topUsers,
      topEmployees: topEmployees.filter(Boolean)
    };
  }
}


module.exports = new AdminSaleService();
