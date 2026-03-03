const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🌱 Iniciando borrado completo y generacion de Seed...');

  // 1. LIMPIEZA PROFUNDA POR TRUNCAMIENTO EN CASCADA
  // Esto saltea validaciones de llaves foraneas y resetea IDs a 1.
  const tableNames = [
    'Category', 'Product', 'SKU', 'VariantOption', 'Role', 'Permission', 
    'User', 'Notification', 'RefreshToken', 'PointsHistory', 'Cart', 'CartItem', 
    'Comment', 'Sale', 'SaleItem', 'Coupon', 'PaymentTransaction', 'StockReservation', 
    'Event', 'Discount', 'ShippingZone', 'StoreConfig', 'Currency', 'ProductPrice', 
    'PaymentGateway', 'GatewayCurrencySupport', 'AuditLog', 'AccessLog', 'Transfer', 
    'Branch', 'BranchInventory', 'UserBranch', 'StockTransfer', 'StockTransferItem', 
    'Supplier', 'SupplierSKU', 'Purchase', 'PurchaseItem', 'StockMovement', 
    'SupplierPayment', 'ChatConversation', 'ChatMessage', 'ChatAutoResponse', 
    'ErrorLog', 'SaleReceipt', 'BarcodeSequence'
  ];

  try {
    for (const tableName of tableNames) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`);
    }
    console.log('✅ Base de datos truncada y limpiada.');
  } catch (err) {
    console.error('⚠️ Advertencia: Error durante truncamiento. Ignorar si la tabla no existia.', err.message);
  }

  // 2. CONFIGURACION BASE: Roles y Configuracion de Tienda
  console.log('-> Generando Configuraciones Básicas...');
  
  const superAdminRole = await prisma.role.create({ data: { name: 'SUPER_ADMIN', description: 'Acceso total' } });
  const adminRole = await prisma.role.create({ data: { name: 'ADMIN', description: 'Administrador general' } });
  const employeeRole = await prisma.role.create({ data: { name: 'EMPLOYEE', description: 'Empleado sucursal' } });
  const customerRole = await prisma.role.create({ data: { name: 'CUSTOMER', description: 'Cliente Regular' } });

  await prisma.storeConfig.create({
    data: {
      storeName: 'Kwik-E-Mart Electro',
      contactEmail: 'soporte@kwikemart.com',
      contactPhone: '+5491122334455',
      address: 'Evergreen Terrace 742, Springfield',
      taxRate: 21.00,
      currencySymbol: '$',
      lowStockThreshold: 10,
      criticalStockThreshold: 3,
      preventStockout: true,
      enablePoints: true,
      pointsPerCurrency: 0.05,
      enableShipping: true,
      freeShippingThreshold: 50000,
      enabledPaymentMethods: ['MERCADO_PAGO', 'CASH', 'TRANSFER'],
      enableEvents: true,
      enableBranches: true,
      enableTransfers: true,
      enableStockMovements: true,
      enableStockControl: true,
      enablePointsRedemption: true,
      moneyPerPoint: 2,
      baseCurrency: 'ARS',
      defaultCurrency: 'ARS',
      marqueeText: '¡Bienvenidos a nuestra nueva tienda web con envíos nacionales!'
    }
  });

  // 3. MONEDAS Y PASARELAS
  console.log('-> Generando Monedas y Pasarelas de Pago...');
  
  const ars = await prisma.currency.create({
    data: { code: 'ARS', symbol: '$', exchangeRateToBase: 1.0, isActive: true }
  });
  const usd = await prisma.currency.create({
    data: { code: 'USD', symbol: 'U$D', exchangeRateToBase: 1200.0, isActive: true }
  });

  const mpGateway = await prisma.paymentGateway.create({
    data: { name: 'Mercado Pago', slug: 'mercadopago', isActive: true, isGlobalFallback: true }
  });

  await prisma.gatewayCurrencySupport.create({ data: { gatewayId: mpGateway.id, currencyCode: 'ARS', isPrimary: true } });

  // 4. SUCURSALES (Branches)
  console.log('-> Generando Sucursales...');
  
  const hqBranch = await prisma.branch.create({
    data: {
      name: 'Casa Central',
      code: 'HQ01',
      address: 'Av. Corrientes 1234',
      city: 'CABA',
      state: 'Buenos Aires',
      country: 'Argentina',
      phone: '1155667788',
      operatingHours: { monday: { open: "09:00", close: "18:00" }, saturday: { open: "10:00", close: "14:00" } },
      isActive: true,
      isHeadquarters: true
    }
  });

  const palermoBranch = await prisma.branch.create({
    data: {
      name: 'Sucursal Palermo',
      code: 'PAL02',
      address: 'Honduras 4567',
      city: 'CABA',
      state: 'Buenos Aires',
      country: 'Argentina',
      phone: '1122334455',
      operatingHours: { monday: { open: "10:00", close: "20:00" } },
      isActive: true,
      isHeadquarters: false
    }
  });

  // 5. USUARIOS Y SUPERUSUARIO
  console.log('-> Generando Usuarios...');
  const passwordHash = await bcrypt.hash('123456', 10);

  const superAdmin = await prisma.user.create({
    data: {
      name: 'Alejandro Mercado',
      email: 'alesamu.am@gmail.com',
      password: passwordHash,
      roleId: superAdminRole.id,
      status: 'ACTIVE',
      points: 99999,
      activeBranchId: hqBranch.id,
      adminBranches: {
        create: [{ branchId: hqBranch.id }, { branchId: palermoBranch.id }]
      }
    }
  });

  const standardEmployee = await prisma.user.create({
    data: {
      name: 'Carlos Vendedor',
      email: 'carlos@tienda.com',
      password: passwordHash,
      roleId: employeeRole.id,
      status: 'ACTIVE',
      activeBranchId: palermoBranch.id,
      adminBranches: { create: [{ branchId: palermoBranch.id }] }
    }
  });

  const customer1 = await prisma.user.create({
    data: {
      name: 'María Cliente',
      email: 'maria@gmail.com',
      password: passwordHash,
      roleId: customerRole.id,
      status: 'ACTIVE',
      points: 500,
      phone: '1133221144',
      address: 'Calle Falsa 123',
      city: 'Rosario',
      state: 'Santa Fe'
    }
  });
  
  const customer2 = await prisma.user.create({
     data: {
      name: 'Esteban Comprador',
      email: 'esteban@gmail.com',
      password: passwordHash,
      roleId: customerRole.id,
      status: 'ACTIVE',
      points: 0
    }
  });

// Se remueve la llave y el catch intermediario.
  // 6. CATEGORÍAS Y PROVEEDORES
  console.log('-> Generando Categorías y Proveedores...');
  
  const techCategory = await prisma.category.create({
    data: { name: 'Tecnología', slug: 'tecnologia', description: 'Computadoras, Celulares y más.' }
  });
  const audioCategory = await prisma.category.create({
    data: { name: 'Audio', slug: 'audio', description: 'Auriculares, Parlantes.', parentId: techCategory.id }
  });
  const clothCategory = await prisma.category.create({
    data: { name: 'Indumentaria', slug: 'indumentaria', description: 'Ropa de temporada' }
  });

  const suppTech = await prisma.supplier.create({
    data: { tradeName: 'Electro Import S.A.', legalName: 'Electro Import S.A.', taxId: '30-11111111-5', taxStatus: 'Responsable Inscripto', email: 'ventas@electroimport.com', phone: '08001112233', billingAddress: 'Parque Patricios 100' }
  });

  const suppCloth = await prisma.supplier.create({
    data: { tradeName: 'Textil Sur', legalName: 'Textiles del Sur SRL', taxId: '30-22222222-6', taxStatus: 'Responsable Inscripto', email: 'contacto@textilsur.com.ar', phone: '08103334455', billingAddress: 'Flores 800' }
  });

  // 7. PRODUCTOS, SKUs Y STOCK
  console.log('-> Generando Productos e Inventarios...');

  // Producto 1: Celular (Unitario, Sin variantes)
  const pPhone = await prisma.product.create({
    data: {
      name: 'Smartphone X Pro 128GB',
      type: 'ELECTRONICA',
      brand: 'GenericBrand',
      model: 'X Pro',
      description: 'El mejor rendimiento de este año. Pantalla OLED 6.5 pulgadas.',
      basePrice: 500000,
      pointsValue: 0,
      pointsReward: 1500,
      images: ['https://placehold.co/400x400/000000/FFFFFF/png?text=Smartphone'],
      condition: 'NEW',
      categoryId: techCategory.id,
      isTrending: true,
      measurementUnit: 'UNIDAD',
      allowFractional: false
    }
  });

  const skuPhone = await prisma.sKU.create({
    data: {
      code: 'PHONE-XPRO-BLK', price: 550000, stock: 15, productId: pPhone.id, barcode: '7791234567890'
    }
  });
  await prisma.supplierSKU.create({ data: { supplierId: suppTech.id, skuId: skuPhone.id, basePurchasePrice: 400000, currency: 'ARS' } });
  
  // Agregar stock a sucursales
  await prisma.branchInventory.create({ data: { branchId: hqBranch.id, skuId: skuPhone.id, stock: 10, price: 550000 } });
  await prisma.branchInventory.create({ data: { branchId: palermoBranch.id, skuId: skuPhone.id, stock: 5, price: 550000 } });

  // Producto 2: Remera (Variantes por Talle/Color)
  const pShirt = await prisma.product.create({
    data: {
      name: 'Remera Básica Algodón',
      type: 'ROPA',
      brand: 'UrbanStyle',
      description: '100% algodón peinado. Ideal para el verano.',
      basePrice: 15000,
      pointsValue: 200,
      pointsReward: 50,
      images: ['https://placehold.co/400x400/2980b9/ffffff/png?text=Remera+Azul'],
      categoryId: clothCategory.id,
      measurementUnit: 'UNIDAD'
    }
  });

  // Variantes
  const skuShirtRojoM = await prisma.sKU.create({
    data: { code: 'TSHIRT-ROJO-M', price: 15000, stock: 20, productId: pShirt.id, barcode: '7792222000010' }
  });
  await prisma.variantOption.create({ data: { name: 'Color', value: 'Rojo', skuId: skuShirtRojoM.id } });
  await prisma.variantOption.create({ data: { name: 'Talle', value: 'M', skuId: skuShirtRojoM.id } });
  await prisma.branchInventory.create({ data: { branchId: hqBranch.id, skuId: skuShirtRojoM.id, stock: 20, price: 15000 } });

  const skuShirtAzulL = await prisma.sKU.create({
    data: { code: 'TSHIRT-AZUL-L', price: 15000, stock: 10, productId: pShirt.id, barcode: '7792222000011' }
  });
  await prisma.variantOption.create({ data: { name: 'Color', value: 'Azul', skuId: skuShirtAzulL.id } });
  await prisma.variantOption.create({ data: { name: 'Talle', value: 'L', skuId: skuShirtAzulL.id } });
  await prisma.branchInventory.create({ data: { branchId: palermoBranch.id, skuId: skuShirtAzulL.id, stock: 10, price: 15000 } });

  // Producto 3: Cable por Metro (Fraccionario)
  const pCable = await prisma.product.create({
    data: {
      name: 'Cable Coaxial RF',
      type: 'TENDIDO',
      brand: 'Genérico',
      description: 'Bobina de alta velocidad para antenas y redes.',
      basePrice: 3500, // Precio por metro
      images: ['https://placehold.co/400x400/7f8c8d/ffffff/png?text=Bobina+Cable'],
      categoryId: techCategory.id,
      measurementUnit: 'METRO',
      allowFractional: true
    }
  });
  const skuCable = await prisma.sKU.create({
     data: { code: 'CABLE-COAX-1M', price: 3500, stock: 250.5, productId: pCable.id }
  });
  await prisma.branchInventory.create({ data: { branchId: hqBranch.id, skuId: skuCable.id, stock: 250.5, price: 3500 } });

  // Movimientos de Stock Iniciales (Auditoría)
  await prisma.stockMovement.create({ data: { skuId: skuPhone.id, branchId: hqBranch.id, type: 'MANUAL_ADJUSTMENT', quantity: 10, resultingStock: 10, userId: superAdmin.id, notes: 'Inventario inicial automatizado' } });
  await prisma.stockMovement.create({ data: { skuId: skuPhone.id, branchId: palermoBranch.id, type: 'MANUAL_ADJUSTMENT', quantity: 5, resultingStock: 5, userId: superAdmin.id, notes: 'Inventario inicial automatizado' } });

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
    data: { saleId: sale1.id, branchId: hqBranch.id, ticketNumber: 'HQ01-001', subtotal: 550000, discount: 10000, total: 540000, paymentType: 'MERCADO_PAGO', status: 'ISSUED' }
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
}

main()
  .catch(e => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
