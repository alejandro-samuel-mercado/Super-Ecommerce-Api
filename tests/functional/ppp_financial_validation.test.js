const prisma = require('../../src/config/prisma');
const PurchaseService = require('../../src/services/purchase.service');
const ReportService = require('../../src/services/report.service');
const SaleService = require('../../src/services/sale.service');

async function testPPPandFinancials() {
    console.log('--- Iniciando Prueba de PPP y Precisión Financiera ---');
    
    // Configurar timeout global de Prisma para esta sesión
    // prisma.$connect() ya está implícito.

    try {
        // 1. Configuración inicial - USAR UN SKU Y SUCURSAL NUEVOS PARA AISLAMIENTO
        const branch = await prisma.branch.create({
            data: { name: 'Sucursal Test Financiero', code: 'TESTBR-' + Date.now(), address: 'N/A', city: 'N/A', state: 'N/A', phone: '0', operatingHours: {} }
        });
        const branchId = branch.id;
        
        const product = await prisma.product.create({
            data: { name: 'Producto Test PPP', type: 'ELECTRONICA', brand: 'TEST_BRAND', description: 'Test', basePrice: 1000, categoryId: 1, measurementUnit: 'UNIDAD', allowFractional: false }
        });
        const sku = await prisma.sKU.create({
            data: { code: 'SKU-TEST-' + Date.now(), price: 20000, stock: 0, productId: product.id }
        });
        const skuId = sku.id;

        const userId = 1;

        console.log(`Entorno aislado: Sucursal ${branchId}, SKU ${skuId}`);

        // 2. Primera Compra: 10 unidades a 10 USD c/u (Exch: 800 ARS/USD) -> Costo ARS: 8000
        const po1 = await prisma.purchase.create({
            data: {
                branchId,
                supplierId: 1,
                userId,
                status: 'CONFIRMED',
                exchangeRateAtPurchase: 800,
                estimatedTotal: 100,
                currencyCode: 'USD',
                items: {
                    create: [{ skuId, quantity: 10, unitPrice: 10, subtotal: 100 }]
                },
                payment: { 
                    create: { 
                        amount: 100, 
                        method: 'TRANSFER', 
                        paymentDate: new Date(),
                        supplierId: 1,
                        createdBy: userId,
                        amountInBaseCurrency: 80000
                    } 
                }
            }
        });

        await PurchaseService.receive(po1.id, userId);
        
        let inv = await prisma.branchInventory.findUnique({ where: { skuId_branchId: { skuId, branchId } } });
        console.log(`PO1 Recibida. Stock: ${inv.stock}, Costo Base (PPP): ${inv.costPrice}`);
        
        // 3. Segunda Compra: 10 unidades a 15 USD c/u (Exch: 1000 ARS/USD) -> Costo ARS: 15000
        const po2 = await prisma.purchase.create({
            data: {
                branchId,
                supplierId: 1,
                userId,
                status: 'CONFIRMED',
                exchangeRateAtPurchase: 1000,
                estimatedTotal: 150,
                currencyCode: 'USD',
                items: {
                    create: [{ skuId, quantity: 10, unitPrice: 15, subtotal: 150 }]
                },
                payment: { 
                    create: { 
                        amount: 150, 
                        method: 'TRANSFER', 
                        paymentDate: new Date(),
                        supplierId: 1,
                        createdBy: userId,
                        amountInBaseCurrency: 150000
                    } 
                }
            }
        });

        await PurchaseService.receive(po2.id, userId);
        inv = await prisma.branchInventory.findUnique({ where: { skuId_branchId: { skuId, branchId } } });
        console.log(`PO2 Recibida. Stock: ${inv.stock}, Costo Base (PPP): ${inv.costPrice}`);
        // Esperado PPP: (10 * 8000 + 10 * 15000) / 20 = 11500

        // Refrescar inventario tras PO2 para tener el costo promedio actual
        const currentInv = await prisma.branchInventory.findUnique({ where: { skuId_branchId: { skuId, branchId } } });

        // 4. Venta: 5 unidades a 20000 ARS c/u
        const sale = await prisma.sale.create({
            data: {
                branchId,
                userId: 1, 
                total: 100000,
                subtotal: 100000,
                totalInBaseCurrency: 100000,
                paymentStatus: 'PAID',
                deliveryStatus: 'DELIVERED',
                paymentType: 'CASH',
                exchangeRateAtPurchase: 1,
                items: {
                    create: [{ 
                        skuId, 
                        quantity: 5, 
                        unitPrice: 20000, 
                        subtotal: 100000, 
                        unitCostBase: currentInv.costPrice,
                        productName: 'Producto Prueba',
                        skuCode: 'SKU-PRUEBA'
                    }]
                }
            }
        });

        // Simular descuento de stock (ya que usamos prisma.create directo)
        await prisma.branchInventory.update({
            where: { skuId_branchId: { skuId, branchId } },
            data: { stock: { decrement: 5 }, soldQuantity: { increment: 5 } }
        });

        // 5. Reembolso: Devolver 2 unidades de la venta
        const AdminSaleService = require('../../src/services/admin-sale.service');
        await AdminSaleService.refundSale(userId, sale.id, 'Prueba de integridad de costos', '127.0.0.1');
        
        const finalInv = await prisma.branchInventory.findUnique({
            where: { skuId_branchId: { skuId, branchId } }
        });
        
        console.log(`--- Validación de Reembolso ---`);
        console.log(`Stock final (Esperado 20): ${finalInv.stock}`);
        console.log(`Costo final (PPP, Esperado 11500): ${finalInv.costPrice}`);

        // 6. Verificar Reporte Final
        const stats = await ReportService.getFinancialStats({
            startDate: new Date(new Date().setDate(new Date().getDate() - 1)),
            endDate: new Date(),
            branchId
        });

        console.log('--- Estadísticas del Reporte ---');
        console.log(`Ingreso Bruto: ${stats.totalGrossRevenue}`);
        console.log(`COGS Total: ${stats.totalCOGS}`);
        console.log(`Utilidad Bruta: ${stats.grossProfit}`);

        // Verificaciones
        if (Math.abs(Number(finalInv.costPrice) - 11500) < 1 && Number(finalInv.stock) === 20) {
            console.log('✅ VALIDACIÓN EXITOSA: Reembolso mantuvo integridad de stock y costo.');
        } else {
            console.log(`❌ FALLO: Stock o costo incorrecto tras reembolso.`);
        }

    } catch (error) {
        console.error('Error en la prueba:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testPPPandFinancials();
