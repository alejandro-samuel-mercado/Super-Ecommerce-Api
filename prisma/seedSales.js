  // 8. EVENTOS, CUPONES Y ENVÍOS
  console.log('-> Generando Eventos, Descuentos y Envíos...');

  const activeEvent = await prisma.event.create({
    data: {
      name: 'CyberWeek 2026',
      startDate: new Date(new Date().setDate(new Date().getDate() - 1)),
      endDate: new Date(new Date().setDate(new Date().getDate() + 7)),
      active: true,
      shippingConfig: { type: 'DISCOUNT', value: 50 },
      shippingEnabled: true,
      couponsEnabled: true,
      pointsEnabled: true,
      taxesEnabled: true,
      bannerMessages: { top: "¡Aprovechá hasta 50% descuento en envíos!" }
    }
  });

  const globalDiscount = await prisma.discount.create({
    data: { name: 'Descuento CyberWeek', type: 'PERCENTAGE', value: 10, priority: 1, scope: 'GLOBAL', eventId: activeEvent.id, stackable: true, active: true }
  });

  const couponBienvenida = await prisma.coupon.create({
    data: { code: 'BIENVENIDA20', type: 'PERCENTAGE', value: 20, minPurchase: 10000, maxUses: 100, usedCount: 1, active: true }
  });

  await prisma.shippingZone.create({ data: { country: 'Argentina', province: 'Buenos Aires', city: 'CABA', cost: 3500, active: true } });
  await prisma.shippingZone.create({ data: { country: 'Argentina', province: 'Buenos Aires', city: 'Resto PBA', cost: 5500, active: true } });
  await prisma.shippingZone.create({ data: { country: 'Argentina', province: null, city: null, cost: 8000, active: true } }); // Nacional


  // 9. VENTAS Y CARROS
  console.log('-> Generando Ventas Simuladas...');

  const sale1 = await prisma.sale.create({
     data: {
       userId: customer1.id,
       branchId: hqBranch.id,
       couponId: couponBienvenida.id,
       total: 540000,
       subtotal: 550000,
       discount: 10000,
       taxAmount: 113400, // 21%
       shippingCost: 0,
       appliedDiscounts: [{ name: globalDiscount.name, value: globalDiscount.value }],
       paymentStatus: 'PAID',
       paymentType: 'MERCADO_PAGO',
       deliveryType: 'DELIVERY',
       deliveryStatus: 'SHIPPED',
       deliveryAddress: 'Avenida Falsa 123, CABA',
       currencyCode: 'ARS',
       exchangeRateAtPurchase: 1.0,
       totalInBaseCurrency: 540000,
       pointsUsed: 0,
       pointsDiscount: 0,
       paymentGateway: 'mercadopago',
       mpPaymentId: 'MP-9988776655',
       items: {
         create: [
           { productName: pPhone.name, skuCode: skuPhone.code, unitPrice: 550000, quantity: 1, subtotal: 550000, measurementUnit: 'UNIDAD', skuId: skuPhone.id }
         ]
       }
     }
  });

  await prisma.paymentTransaction.create({
    data: { paymentId: 'MP-9988776655', saleId: sale1.id, status: 'COMPLETED', webhookPayload: { status: 'approved' }, processedAt: new Date() }
  });

  await prisma.saleReceipt.create({
    data: { saleId: sale1.id, branchId: hqBranch.id, ticketNumber: 'HQ01-001', subtotal: 550000, discount: 10000, total: 540000, currencyCode: 'ARS', paymentType: 'MERCADO_PAGO', status: 'ISSUED' }
  });

  // Carrito Abandonado
  await prisma.cart.create({
    data: {
      userId: customer2.id,
      items: {
        create: [
          { skuId: skuCable.id, quantity: 25.5 }
        ]
      }
    }
  });

  console.log('✅ Seed finalizado exitosamente. ¡Datos cargados con exito!');
