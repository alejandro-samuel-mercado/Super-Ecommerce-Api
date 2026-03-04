const SaleService = require('./sale.service');
const PaymentAdapter = require('../adapters/payment.adapter');
const prisma = require('../config/prisma');

class PaymentService {

    /**
     * Inicia un pago para una venta específica.
     * @param {number|string} saleId 
     * @param {number} userId 
     * @param {string} gatewaySlug 
     * @returns {Promise<string>} URL de redireccion (init_point)
     */
    async initiatePayment(saleId, userId, gatewaySlug) {
        // 1. Obtener la venta y verificar propiedad
        // Usamos la lógica de SaleService o prisma directo si necesitamos acceso crudo
        const sale = await prisma.sale.findUnique({
            where: { id: Number(saleId) },
            include: { items: true }
        });

        if (!sale) {
            throw new Error('Sale not found');
        }

        if (sale.userId && sale.userId !== userId) {
            throw new Error('Permission denied');
        }

        // 2. Validar Estado
        if (sale.paymentStatus === 'PAID') {
            throw new Error('Sale is already paid');
        }

        // 3. Obtener Email de Usuario (Requerido por MP)
        let userEmail = 'guest@store.com';
        if (sale.userId) {
            const user = await prisma.user.findUnique({ where: { id: sale.userId } });
            if (user && user.email) userEmail = user.email;
        }

        // 4. Crear Preferencia via Adaptador
        const initPoint = await PaymentAdapter.createPreference(
            sale, 
            { email: userEmail }, 
            gatewaySlug
        );

        // 5. Actualizar Venta con gateway seleccionado (Auditoría)
        await prisma.sale.update({
            where: { id: sale.id },
            data: { 
                paymentGateway: gatewaySlug || undefined
            }
        });

        return initPoint;
    }
}

module.exports = new PaymentService();
