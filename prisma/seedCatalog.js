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

