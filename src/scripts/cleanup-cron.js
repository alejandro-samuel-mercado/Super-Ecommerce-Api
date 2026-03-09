const cron = require('node-cron');
const stockCleanupService = require('../services/stock-cleanup.service');

/**
 * Tarea en segundo plano: Cron de Limpieza
 * Este script programa y ejecuta tareas de mantenimiento periódicas.
 */

/**
 * 1. Limpieza de reservas de stock
 * Se ejecuta cada 30 minutos
 */
cron.schedule('*/30 * * * *', async () => {
  
    try {
        const cleaned = await stockCleanupService.cleanupExpiredReservations();
        if (cleaned > 0) {
           
        }
    } catch (error) {
       
    }
});

/**
 * 2. Limpieza de ventas abandonadas
 * Se ejecuta cada hora
 */
cron.schedule('0 * * * *', async () => {
    
    try {
        const SaleService = require('../services/sale.service');
        const cleaned = await SaleService.cleanupAbandonedSales();
        if (cleaned > 0) {
           
        }
    } catch (error) {
        console.error('[Cron] ❌ Error en limpieza de ventas:', error.message);
    }
});

