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

  async updatePaymentStatus(adminId, saleId, newStatus, ip) {
      const sale = await prisma.sale.findUnique({ where: { id: parseInt(saleId) } });
      if (!sale) throw new Error('Venta no encontrada');

      const updatedSale = await prisma.sale.update({
          where: { id: parseInt(saleId) },
          data: { paymentStatus: newStatus }
      });

       await AuditService.logAction({
          adminId,
          action: 'UPDATE_PAYMENT_STATUS',
          entityType: 'SALE',
          entityId: saleId,
          changes: { prev: sale.paymentStatus, new: newStatus },
          ip
      });

      return updatedSale;
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

    console.log(`[STATS DEBUG] range=${timeRange}, branch=${branchId}, startDate=${startDate?.toISOString()}`);
    if (startDate) {
        filter.createdAt = { gte: startDate };
    }

    // 1. Ingresos Totales (Filtrado) - Usar totalInBaseCurrency para consolidación real
    const totalRevenueAgg = await prisma.sale.aggregate({
      _sum: { totalInBaseCurrency: true },
      where: filter
    });
    const totalRevenue = Number(totalRevenueAgg._sum.totalInBaseCurrency || 0);
    console.log(`[STATS DEBUG] totalRevenue=${totalRevenue}, filter=`, JSON.stringify(filter));

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
