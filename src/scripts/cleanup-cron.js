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
    console.log('[Cron] 🧹 Iniciando limpieza de reservas de stock...');
    try {
        const cleaned = await stockCleanupService.cleanupExpiredReservations();
        if (cleaned > 0) {
            console.log(`[Cron] ✅ Limpieza de Stock: Se liberaron ${cleaned} reservas expiradas.`);
        }
    } catch (error) {
        console.error('[Cron] ❌ Error en limpieza de stock:', error.message);
    }
});

/**
 * 2. Limpieza de ventas abandonadas
 * Se ejecuta cada hora
 */
cron.schedule('0 * * * *', async () => {
    console.log('[Cron] 🛒 Iniciando limpieza de ventas abandonadas...');
    try {
        const SaleService = require('../services/sale.service');
        const cleaned = await SaleService.cleanupAbandonedSales();
        if (cleaned > 0) {
            console.log(`[Cron] ✅ Limpieza de Ventas: Se cancelaron ${cleaned} órdenes abandonadas sin pagar.`);
        }
    } catch (error) {
        console.error('[Cron] ❌ Error en limpieza de ventas:', error.message);
    }
});

console.log('[Cron] 🚀 Tareas en segundo plano inicializadas correctamente.');
