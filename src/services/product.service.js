const prisma = require('../config/prisma');
const PriceService = require('./price.service');
const DiscountService = require('./discount.service');

class ProductService {

  /**
   * Normalizar query de búsqueda para manejar errores tipográficos
   * - Eliminar caracteres duplicados excesivos (mantener máx 2)
   * - Normalizar espacios en blanco
   * - Minúsculas
   */
  normalizeSearchQuery(query) {
    if (!query || typeof query !== 'string') return '';
    
    return query
      .toLowerCase()
      .trim()
      // Eliminar caracteres consecutivos duplicados (permitir máx 2, e.g., "ll" en "hello")
      .replace(/(.)\1{2,}/g, '$1$1')
      // Normalizar espacios múltiples a un solo espacio
      .replace(/\s+/g, ' ')
      // Eliminar espacios extra alrededor de puntuación
      .replace(/\s([.,!?])/g, '$1');
  }

  /**
   * Helper recursivo para obtener IDs de categoría y todos sus descendientes
   */
  async getDescendantCategoryIds(categoryId) {
    const children = await prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true }
    });

    let ids = [categoryId];
    for (const child of children) {
      const childIds = await this.getDescendantCategoryIds(child.id);
      ids = [...ids, ...childIds];
    }
    return ids;
  }

  /**
 * Crear un producto con sus variantes (SKUs).
 * Si no se envían variantes, se crea un SKU por defecto.
 * Transacción ACID para asegurar integridad.
 * AUTOMATICAMENTE crea registros de inventario en todas las sucursales.
 */
async createProduct(data) {
  const { 
    name, type, brand, model, description, basePrice, 
    pointsValue, pointsReward, images, categoryId, stockInicial,
    condition, isTrending, qr, 
    variants,
    skus,
    measurementUnit,
    allowFractional
  } = data;

  // Normalización: alias 'skus' para 'variants'
  const finalVariants = variants || skus || [];

  return await prisma.$transaction(async (tx) => {
    // 1. Crear el Producto Base
    const product = await tx.product.create({
      data: {
        name,
        type,
        brand,
        model,
        description,
        basePrice,
        pointsValue: parseInt(pointsValue || 0),
        pointsReward: parseInt(pointsReward || 0),
        images: images || [], 
        categoryId: parseInt(categoryId),
        condition,
        isTrending,
        qr,
        measurementUnit: measurementUnit || 'UNIDAD',
        allowFractional: allowFractional || false
      }
    });

    // 2. Obtener todas las sucursales activas
    const branches = await tx.branch.findMany({
      where: { isActive: true },
      select: { id: true }
    });


    // 3. Procesar SKUs / Variantes
    const createdSkus = [];
    
    if (!finalVariants || finalVariants.length === 0) {
      // CASO 1: Producto Simple (Sin variantes explícitas)
      const sku = await tx.sKU.create({
        data: {
          productId: product.id,
          code: `${product.id}-DEFAULT`,
          price: basePrice,
          stock: data.stockInicial || 0,
          variantOptions: {
             create: { name: 'Type', value: 'Unique' } 
          }
        }
      });
      createdSkus.push(sku);
    } else {
      // CASO 2: Producto con múltiples variantes
      for (const variant of finalVariants) {
        
        const skuCode = variant.code || `${product.id}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        const newSku = await tx.sKU.create({
          data: {
            productId: product.id,
            code: skuCode,
            price: variant.price || basePrice,
            stock: variant.stock || 0,
          }
        });

        // Crear atributos dinámicos (Color, Talle, etc.)
        if (variant.attributes && Array.isArray(variant.attributes)) {
          await tx.variantOption.createMany({
            data: variant.attributes.map(attr => ({
              skuId: newSku.id,
              name: attr.name,
              value: attr.value
            }))
          });
        }
        
        createdSkus.push(newSku);
      }
    }

    // 4. Crear BranchInventory para cada SKU en todas las sucursales
    const inventoryRecords = [];
    for (const sku of createdSkus) {
      for (const branch of branches) {
        inventoryRecords.push({
          skuId: sku.id,
          branchId: branch.id,
          stock: 0,
          minStock: 5,
          price: sku.price,
          isActive: true
        });
      }
    }

    if (inventoryRecords.length > 0) {
      await tx.branchInventory.createMany({
        data: inventoryRecords
      });
    }

    // Producto completo con sus SKUs
    return await tx.product.findUnique({
      where: { id: product.id },
      include: { 
          skus: {
              include: { variantOptions: true }
          } 
      }
    });
  }, {
    maxWait: 5000,
    timeout: 10000
  });
}

  /**
   * Listar productos con filtros avanzados (Endpoint Único Robust)
   */
  async getProducts(params = {}) {
    // 1. Destructure parameters
    const {
      page = 1,
      limit = 15,
      search,
      category,
      subcategory,
      brand,
      model,
      minPrice,
      maxPrice,
      sort,
      inStock,
      isTrending,
      isNew,
      freeShipping,
      branchId,
      currency,
      ...attributes
    } = params;

    // Sucursal por defecto si no se provee o es invalida
    const activeBranchId = Number(branchId) > 0 ? Number(branchId) : 1;

    
    // Ignorar teclas de atributos dinamicos internos
    const ignoredKeys = ['order']; 
    const dynamicAttrs = Object.entries(attributes).filter(([k]) => !ignoredKeys.includes(k));

    // Sanitizar la paginación
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 15);
    const offset = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = { isActive: true };

    // 2. Logica de Categorías (Recursiva)
    // Helper para obtener la ultima cadena de una potencial formacion
    const getSlug = (param) => Array.isArray(param) ? param[param.length - 1] : param;
    
    const categorySlug = getSlug(subcategory) || getSlug(category);
    
    if (categorySlug) {
      const categoryRecord = await prisma.category.findUnique({
        where: { slug: categorySlug },
        select: { id: true } 
      });
      
      if (categoryRecord) {
        const categoryIds = await this.getDescendantCategoryIds(categoryRecord.id);
        where.categoryId = { in: categoryIds };      
      } else {
        // Casilleria de categoría no encontrada - devolver un resultado nulo inmediatamente
        return {
           data: [],
           total: 0,
           page: Number(page),
           limit: Number(limit),
           totalPages: 0
        };
      }
    }

    // 3. Búsqueda (Texto) con Coincidencia Difusa
    if (search) {
      // Normalizar query de búsqueda
      const normalizedSearch = this.normalizeSearchQuery(search);
      
      where.OR = [
        { name: { contains: normalizedSearch, mode: 'insensitive' } },
        { description: { contains: normalizedSearch, mode: 'insensitive' } },
        { brand: { contains: normalizedSearch, mode: 'insensitive' } },
        { model: { contains: normalizedSearch, mode: 'insensitive' } },
        // Campos de Búsqueda Mejorada
        { qr: { contains: normalizedSearch, mode: 'insensitive' } },
        { 
          skus: { 
            some: { 
              OR: [
                { code: { contains: normalizedSearch, mode: 'insensitive' } },
                { barcode: { contains: normalizedSearch, mode: 'insensitive' } },
                { 
                  variantOptions: { 
                    some: { 
                      value: { contains: normalizedSearch, mode: 'insensitive' } 
                    } 
                  } 
                }
              ]
            } 
          } 
        }
      ];
      
    }
    
    // 4. Filtros Estándar
    if (brand) where.brand = { equals: brand, mode: 'insensitive' };
    if (model) where.model = { contains: model, mode: 'insensitive' };
    
    if (isTrending !== undefined) {
      where.isTrending = isTrending === 'true' || isTrending === true;
    }
    
    if (isNew !== undefined) {
      where.isNew = isNew === 'true' || isNew === true;
    }

    if (freeShipping === 'true' || freeShipping === true) {
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      if (config && config.freeShippingThreshold > 0) {
        if (!where.basePrice) where.basePrice = {};
        where.basePrice.gte = parseFloat(config.freeShippingThreshold.toString());
      }
    }

    if (minPrice || maxPrice) {
      if (!where.basePrice) where.basePrice = {};
      if (minPrice && !isNaN(Number(minPrice))) where.basePrice.gte = Number(minPrice);
      if (maxPrice && !isNaN(Number(maxPrice))) where.basePrice.lte = Number(maxPrice);
    }
    
    
    // 5. Filtro de Sucursal - SIEMPRE filtrar por inventario de sucursal cuando se provee branchId
    // Esto asegura que el admin solo vea productos disponibles en la sucursal seleccionada
    if (branchId) {
       // Filtrar productos que tienen inventario en esta sucursal
       where.skus = { 
         some: { 
           branchInventory: { 
             some: { 
               branchId: activeBranchId,
               isActive: true,
               // Si se pide inStock, también filtrar stock > 0
               ...(inStock === 'true' || inStock === true ? { stock: { gt: 0 } } : {})
             } 
           } 
         } 
       };
    } else if (inStock === 'true' || inStock === true) {
       // Legado: Si no hay branchId pero se pide inStock, usar sucursal por defecto
       where.skus = { 
         some: { 
           branchInventory: { 
             some: { 
               branchId: 1,
               stock: { gt: 0 },
               isActive: true
             } 
           } 
         } 
       };
    }

    // 6. Filtrado de Atributos Dinámicos (Color, RAM, etc.)
    // Lógica: Producto debe cumplir TODAS las condiciones de atributos.
    if (dynamicAttrs.length > 0) {
       if (!where.AND) where.AND = [];
       
       dynamicAttrs.forEach(([key, value]) => {
          if (!value) return;
          // Agregar condición: Tiene algún SKU con este atributo
          where.AND.push({
             skus: {
                some: {
                   variantOptions: {
                      some: {
                         name: { equals: key, mode: 'insensitive' },
                         value: { equals: String(value), mode: 'insensitive' }
                      }
                   }
                }
             }
          });
       });
    }

    // 7. Ordenamiento
    let orderBy = { createdAt: 'desc' };
    if (sort) {
        switch (sort) {
            case 'price-asc': orderBy = { basePrice: 'asc' }; break;
            case 'price-desc': orderBy = { basePrice: 'desc' }; break;
            case 'name-asc': orderBy = { name: 'asc' }; break;
            case 'name-desc': orderBy = { name: 'desc' }; break;
            case 'newest': orderBy = { createdAt: 'desc' }; break;
            case 'oldest': orderBy = { createdAt: 'asc' }; break;
        }
    }

    // 8. Ejecutar Query (Secuencial para evitar timeout de conexión y mejor debug)
    
    try {
     
        const total = await prisma.product.count({ where });
        
        let products = [];
        if (total > 0) {
            products = await prisma.product.findMany({
                where,
                include: {
                  category: true,
                  skus: {
                     include: { 
                       variantOptions: true,
                       branchInventory: {
                         where: { branchId: activeBranchId }
                       }
                     }
                  },
                  _count: {
                    select: { comments: { where: { approved: true } } }
                  }
                },
                orderBy,
                take,
                skip: offset
            });

            // Obtener promedios de calificación para estos productos
            const productIds = products.map(p => p.id);
            const ratingAggregations = await prisma.comment.groupBy({
                by: ['productId'],
                where: { 
                    productId: { in: productIds },
                    approved: true,
                    rating: { not: null }
                },
                _avg: { rating: true }
            });

            const ratingsMap = Object.fromEntries(
                ratingAggregations.map(agg => [agg.productId, agg._avg.rating])
            );

            // 4. Inyectar precios multimoneda si se solicita moneda específica
            if (currency) {
              const productIds = products.map(p => p.id);
              const multiPrices = await PriceService.getMultipleProductPrices(productIds, currency);
              const priceMap = new Map(multiPrices.map(mp => [mp.productId, { price: mp.price, ratio: mp.ratio }]));
              
              products = products.map(p => {
                const priceData = priceMap.get(p.id);
                return {
                  ...p,
                  price: priceData ? priceData.price : p.basePrice,
                  scalingRatio: priceData ? priceData.ratio : 1.0,
                  currencyCode: currency
                };
              });
            }
            
              // Mapear resultados para inyectar Precio/Stock de Sucursal y Ratings
              products = await Promise.all(products.map(async (p) => {
                const ratio = p.scalingRatio || 1.0;
                const mappedSkus = p.skus.map(sku => {
                  const branchInv = sku.branchInventory && sku.branchInventory[0];
                  
                  return {
                    ...sku,
                    stock: branchInv ? branchInv.stock : sku.stock,
                    // Siempre usar sku.price como fuente de verdad del precio.
                    // branchInv.price puede estar desincronizado.
                    price: parseFloat(sku.price.toString()) * ratio,
                    globalStock: sku.stock,
                    globalPrice: sku.price
                  };
                });

                // Inyectar DESCUENTOS como metadata (sin sobrescribir price)
                const discountInfo = await DiscountService.getDiscountForProduct(p, { 
                  currencyCode: currency, 
                  branchId: activeBranchId 
                });

                // Agregar info de descuento a cada SKU sin tocar price
                const finalSkus = mappedSkus.map(sku => {
                  if (discountInfo.discountPercentage > 0) {
                    const skuDiscountedPrice = sku.price * (1 - (discountInfo.discountPercentage / 100));
                    return { ...sku, discountedPrice: skuDiscountedPrice };
                  }
                  return sku;
                });

                return { 
                  ...p, 
                  skus: finalSkus,
                  averageRating: ratingsMap[p.id] || 0,
                  ratingCount: p._count.comments,
                  // price se mantiene como el precio REAL del producto
                  discountedPrice: discountInfo.discountedPrice,
                  discountPercentage: discountInfo.discountPercentage
                };
              }));
        }

        return {
           data: products,
           total,
           page: Number(page),
           limit: Number(limit),
           totalPages: Math.ceil(total / take)
        };
    } catch (err) {
        console.error('[ProductService] Error en FindMany/Count Details:', {
            message: err.message,
            code: err.code,
            meta: err.meta,
            stack: err.stack
        });
        throw err;
    }
  }

  /**
   * Obtener detalle de producto
   */
  async getProductById(idOrSlug, currencyCode) {
    if (!idOrSlug || idOrSlug === 'undefined' || idOrSlug === 'null') return null;

    let whereClause = {};
    const idNum = parseInt(idOrSlug);

    // Si es un entero válido, asumir que es ID
    if (!isNaN(idNum) && idNum.toString() === idOrSlug.toString()) {
      whereClause = { id: idNum };
    } else {
      // De lo contrario buscar por QR (que actúa como slug)
      whereClause = { qr: idOrSlug };
    }

    const product = await prisma.product.findUnique({
      where: whereClause,
      include: {
        category: true,
        skus: {
          include: { 
            variantOptions: true,
            branchInventory: {
               // Necesitamos contexto aquí. Si no se provee, podríamos obtener todas?
               // Idealmente getProductById debería aceptar contexto.
               // Por ahora, si no hay contexto, buscamos HQ (1) para ser consistente.
               where: { branchId: 1 } 
            }
          }
        },
        comments: {
          where: { approved: true },
          include: { user: true },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { comments: { where: { approved: true } } }
        }
      }
    });
    
    // Mapear inventario de sucursal a SKU
    if (product) {
       product.skus = product.skus.map(sku => {
          const branchInv = sku.branchInventory && sku.branchInventory[0];
          return {
            ...sku,
            // Solo usar branchInv para stock. El precio siempre viene de sku.price.
            stock: branchInv ? branchInv.stock : sku.stock
          };
       });

       const avgRating = await prisma.comment.aggregate({
         where: { 
           productId: product.id, 
           approved: true,
       rating: { not: null }
         },
         _avg: { rating: true }
       });

       product.averageRating = avgRating._avg.rating || 0;
       product.ratingCount = product._count.comments;

       // Inyectar precio multimoneda si se solicita
       if (currencyCode) {
         const priceData = await PriceService.getProductPrice(product.id, currencyCode);
         product.price = priceData;
         product.currencyCode = currencyCode;

         const basePrice = parseFloat(product.basePrice.toString());
         const scalingRatio = basePrice > 0 ? (priceData / basePrice) : 1.0;

         // Convertir precios de SKUs usando el ratio calculado
         product.skus = product.skus.map(sku => ({
             ...sku,
             price: parseFloat(sku.price.toString()) * scalingRatio
         }));
       }
        // Inyectar DESCUENTOS como metadata (sin sobrescribir price)
        const discountInfo = await DiscountService.getDiscountForProduct(product, { 
          currencyCode: currencyCode, 
          branchId: 1 
        });

        // price se mantiene como el precio REAL
        product.discountedPrice = discountInfo.discountedPrice;
        product.discountPercentage = discountInfo.discountPercentage;

        // Agregar info de descuento a cada SKU sin tocar price
        if (product.discountPercentage > 0) {
          product.skus = product.skus.map(sku => {
            const skuDiscountedPrice = sku.price * (1 - (product.discountPercentage / 100));
            return {
              ...sku,
              discountedPrice: skuDiscountedPrice
            };
          });
        }
    }

    return product;
  }

  /**
   * Actualizar un producto
   */
  async updateProduct(id, data) {
    const { categoryId, ...rest } = data;
    
    // Verificar existencia
    const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
    if (!product) throw new Error('Producto no encontrado');

    const updateData = { ...rest };
    if (categoryId) updateData.categoryId = parseInt(categoryId);

    // Filtrar fuera a las variantes / skus de updateData para evitar error de prisma en updateProduct
    delete updateData.variants;
    delete updateData.skus;

    return await prisma.$transaction(async (tx) => {
        // 1. Actualizar Producto Principal
        const updatedProduct = await tx.product.update({
            where: { id: parseInt(id) },
            data: {
                name: data.name,
                type: data.type,
                brand: data.brand,
                model: data.model,
                description: data.description,
                basePrice: data.basePrice,
                pointsValue: data.pointsValue ? parseInt(data.pointsValue) : undefined,
                pointsReward: data.pointsReward ? parseInt(data.pointsReward) : undefined,
                images: data.images,
                categoryId: data.categoryId ? parseInt(data.categoryId) : undefined,
                isActive: data.isActive,
                measurementUnit: data.measurementUnit,
                allowFractional: data.allowFractional,
                condition: data.condition,
                qr: data.qr,
                isTrending: data.isTrending,
                isRecommended: data.isRecommended,
                isNew: data.isNew
            },
            include: { category: true }
        });

        // 2. Administrar Nuevas Variantes (Si fueron proveidas)
        if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
            for (const variant of data.variants) {
                const skuCode = variant.code || `${id}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
                
                const newSku = await tx.sKU.create({
                    data: {
                        productId: parseInt(id),
                        code: skuCode,
                        price: variant.price || data.basePrice,
                        stock: variant.stock || 0,
                    }
                });

                if (variant.attributes && Array.isArray(variant.attributes)) {
                    await tx.variantOption.createMany({
                        data: variant.attributes.map(attr => ({
                            skuId: newSku.id,
                            name: attr.name,
                            value: attr.value
                        }))
                    });
                }
            }
        }

        return updatedProduct;
    });
  }

  /**
   * Eliminar un producto
   * Regla: No borrar si tiene ventas asociadas (cantidadVendida > 0 en algún SKU)
   */
  async deleteProduct(id) {
    return await prisma.$transaction(async (tx) => {
       // 1. Verificar si existen ventas en algún SKU
       const skusConVentas = await tx.sKU.count({
          where: {
            productId: parseInt(id),
            soldQuantity: { gt: 0 }
          }
       });

       if (skusConVentas > 0) {
         throw new Error('No se puede eliminar el producto porque tiene historial de ventas asociadas.');
       }

       // 2. Si no hay ventas, eliminar (Cascade se encarga de SKUs y Variantes)
       // Pero verificamos existencia primero
       try {
         // Fix: use delete where id, previously idProducto which is wrong
         return await tx.product.delete({
            where: { id: parseInt(id) }
         });
       } catch (e) {
         if (e.code === 'P2025') throw new Error('Producto no encontrado');
         throw e;
       }
    });
  }

  /**
   * Obtener recomendaciones de productos
   * 1. Relacionados (Misma categoría)
   * 2. Quienes compraron esto también llevaron (Basado en historial de ventas)
   */
  async getRecommendations(prodId, branchId, currency) {
    const prodIdNum = parseInt(prodId);
    const activeBranchId = Number(branchId) > 0 ? Number(branchId) : 1;

    // 1. OBTENER CATEGORÍA DEL PRODUCTO
    const product = await prisma.product.findUnique({
      where: { id: prodIdNum },
      select: { categoryId: true }
    });

    if (!product) return { related: [], boughtTogether: [] };

    // 2. PRODUCTOS RELACIONADOS (Misma categoría, excluyendo el actual)
    const related = await prisma.product.findMany({
      where: { 
        categoryId: product.categoryId,
        id: { not: prodIdNum },
        isActive: true
      },
      include: {
        category: true,
        skus: {
          include: {
            variantOptions: true,
            branchInventory: { where: { branchId: activeBranchId } }
          }
        },
        _count: {
          select: { comments: { where: { approved: true } } }
        }
      },
      take: 4,
      orderBy: { isTrending: 'desc' }
    });

    // 3. QUIENES COMPRARON ESTO TAMBIÉN LLEVARON
    // - Buscar IDs de ventas que contengan el producto actual (vía cualquier SKU)
    const salesWithThisProduct = await prisma.saleItem.findMany({
      where: {
        sku: { productId: prodIdNum },
        sale: { paymentStatus: 'PAID' }
      },
      select: { saleId: true },
      take: 50,
      distinct: ['saleId']
    });

    const saleIds = salesWithThisProduct.map(s => s.saleId);
    let boughtTogether = [];

    if (saleIds.length > 0) {
      // Buscar otros productos en esas mismas ventas
      const otherItems = await prisma.saleItem.findMany({
        where: {
          saleId: { in: saleIds },
          sku: { productId: { not: prodIdNum } }
        },
        include: { sku: { select: { productId: true } } }
      });

      // Contar ocurrencias por producto
      const productCounts = {};
      otherItems.forEach(item => {
        if (item.sku?.productId) {
          productCounts[item.sku.productId] = (productCounts[item.sku.productId] || 0) + 1;
        }
      });

      // Ordenar y tomar los mejores 4 IDs
      const sortedProductIds = Object.entries(productCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .map(([id]) => parseInt(id));

      if (sortedProductIds.length > 0) {
        boughtTogether = await prisma.product.findMany({
          where: { id: { in: sortedProductIds }, isActive: true },
          include: {
            category: true,
            skus: {
              include: {
                variantOptions: true,
                branchInventory: { where: { branchId: activeBranchId } }
              }
            },
            _count: {
              select: { comments: { where: { approved: true } } }
            }
          }
        });
      }
    }

    // Helper para mapear inventario a nivel de SKU y Ratings
    const processResult = async (list) => {
      if (list.length === 0) return [];
      
      let processed = list;

      // Inyectar precios multimoneda
      if (currency) {
        const productIds = processed.map(p => p.id);
        const multiPrices = await PriceService.getMultipleProductPrices(productIds, currency);
        const priceMap = new Map(multiPrices.map(mp => [mp.productId, mp.price]));
        
        processed = processed.map(p => ({
          ...p,
          price: priceMap.get(p.id) || p.basePrice,
          currencyCode: currency
        }));
      }

      return processed.map(p => {
        const mappedSkus = p.skus.map(sku => {
          const inv = sku.branchInventory?.[0];
          return {
            ...sku,
            stock: inv?.stock ?? 0,
            price: inv?.price ?? sku.price
          };
        });
        return { 
          ...p, 
          skus: mappedSkus,
          averageRating: 0,
          ratingCount: p._count.comments
        };
      });
    };

    return {
      related: await processResult(related),
      boughtTogether: await processResult(boughtTogether)
    };
  }

  /**
   * Actualiza precios manuales para un producto
   */
  async updateProductPrices(productId, prices) {
    // prices: Array<{ currencyCode: string, price: number }>
    return await prisma.$transaction(async (tx) => {
      // 1. Limpiar precios anteriores para este producto
      await tx.productPrice.deleteMany({
        where: { productId: parseInt(productId) }
      });

      // 2. Crear nuevos precios
      if (prices && prices.length > 0) {
        await tx.productPrice.createMany({
          data: prices.map(p => ({
            productId: parseInt(productId),
            currencyCode: p.currencyCode,
            price: parseFloat(p.price)
          }))
        });
      }

      return await tx.productPrice.findMany({
        where: { productId: parseInt(productId) }
      });
    });
  }

  /**
   * Obtiene precios manuales de un producto
   */
  async getProductManualPrices(productId) {
    return await prisma.productPrice.findMany({
      where: { productId: parseInt(productId) }
    });
  }
}

module.exports = new ProductService();
