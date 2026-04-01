const prisma = require('../config/prisma');
const PriceService = require('./price.service');
const DiscountService = require('./discount.service');
const AuditService = require('./audit.service');

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
            allowFractional,
            characteristics,
            specifications,
            youtubeVideo,
            nutritionalInfo,
            octagonsImage,
            taxRate
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
                    qr: qr === "" ? null : qr,
                    measurementUnit: measurementUnit || 'UNIDAD',
                    allowFractional: allowFractional || false,
                    characteristics: characteristics || [],
                    specifications: specifications || [],
                    youtubeVideo: youtubeVideo || null,
                    nutritionalInfo: nutritionalInfo || null,
                    octagonsImage: octagonsImage || null,
                    taxRate: taxRate !== undefined ? (taxRate === "" || taxRate === null || isNaN(parseFloat(taxRate)) ? null : parseFloat(taxRate)) : null
                }
            });

            if (data.adminId) {
                await AuditService.logAction({
                    adminId: data.adminId,
                    action: 'CREATE_PRODUCT',
                    entityType: 'PRODUCT',
                    entityId: product.id,
                    branchId: data.branchId || null,
                    changes: data,
                    ip: data.ip
                });
            }

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
                        costPrice: data.costPrice || 0,
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
                            costPrice: variant.costPrice || data.costPrice || 0,
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
            limit = 20,
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
            includeInactive,
            adminView,
            ...attributes
        } = params;

        // Sucursal por defecto si no se provee o es invalida
        const activeBranchId = Number(branchId) > 0 ? Number(branchId) : 1;


        // Ignorar teclas de atributos dinamicos internos/Frameworks
        const ignoredKeys = ['q', 'term', 'order', 't', '_', 'format', 'search', 'category', 'subcategory', 'brand', 'model', 'minPrice', 'maxPrice', 'sort', 'inStock', 'isTrending', 'isNew', 'freeShipping', 'branchId', 'currency', 'includeInactive', 'adminView'];
        const dynamicAttrs = Object.entries(attributes).filter(([k]) => !ignoredKeys.includes(k));

        // Sanitizar la paginación
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.max(1, Number(limit) || 20);
        const offset = (pageNum - 1) * limitNum;
        const take = limitNum;

        const where = (includeInactive === 'true' || includeInactive === true) ? { isDeleted: false } : { isActive: true, isDeleted: false };

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
            const words = normalizedSearch.split(' ').filter(word => word.length > 0);

            if (words.length > 0) {

                if (!where.AND) where.AND = [];

                words.forEach(word => {
                    where.AND.push({
                        OR: [
                            { name: { contains: word, mode: 'insensitive' } },
                            ...(adminView === 'true' || adminView === true ? [] : [{ description: { contains: word, mode: 'insensitive' } }]),
                            { brand: { contains: word, mode: 'insensitive' } },
                            { model: { contains: word, mode: 'insensitive' } },
                            { qr: { contains: word, mode: 'insensitive' } },
                            {
                                skus: {
                                    some: {
                                        OR: [
                                            { code: { contains: word, mode: 'insensitive' } },
                                            { barcode: { contains: word, mode: 'insensitive' } },
                                            {
                                                variantOptions: {
                                                    some: {
                                                        value: { contains: word, mode: 'insensitive' }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    });
                });
            }
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
        if (branchId && !adminView) {
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
                            branchId: activeBranchId,
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
                            where: {
                                isDeleted: false,
                                ...(adminView === 'true' || adminView === true ? {} : { active: true })
                            },
                            include: {
                                variantOptions: true,
                                branchInventory: (adminView === 'true' || adminView === true) && !branchId 
                                    ? true 
                                    : { where: { branchId: activeBranchId } }
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
                // Batch: pre-cargar todos los descuentos una sola vez para todos los productos
                const discountsMap = await DiscountService.getDiscountsForProducts(products, {
                    currencyCode: currency,
                    branchId: activeBranchId
                });

                products = products.map(p => {
                    const ratio = p.scalingRatio || 1.0;
                    const isGlobal = (adminView === 'true' || adminView === true) && !branchId;
                    const mappedSkus = p.skus.map(sku => {
                        const branchInv = sku.branchInventory && sku.branchInventory[0];

                        return {
                            ...sku,
                            stock: isGlobal ? sku.stock : (branchInv ? branchInv.stock : 0),
                            price: parseFloat(sku.price.toString()) * ratio,
                            costPrice: parseFloat(sku.costPrice?.toString() || 0),
                            globalStock: sku.stock,
                            globalPrice: sku.price
                        };
                    });

                    const discountInfo = discountsMap[p.id] || { discountPercentage: 0, discountedPrice: p.price || p.basePrice };

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
                        discountedPrice: discountInfo.discountedPrice,
                        discountPercentage: discountInfo.discountPercentage
                    };
                });
            }

            return {
                data: products,
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / take)
            };
        } catch (err) {
            throw err;
        }
    }

    /**
     * Obtener detalle de producto
     */
    async getProductById(idOrSlug, currencyCode, branchId) {
        const activeBranchId = Number(branchId) > 0 ? Number(branchId) : 1;
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
                    where: {
                        isDeleted: false,
                        // Aquí no tenemos adminView explícito, pero getProductById se usa en ambos
                        // Si viene de admin (vía controllers), podríamos pasar un flag.
                        // Por ahora, si es para detalle, solemos querer solo los activos en web.
                    },
                    include: {
                        variantOptions: true,
                        branchInventory: {
                            // Necesitamos contexto aquí. Si no se provee, podríamos obtener todas?
                            // Idealmente getProductById debería aceptar contexto.

                            where: { branchId: activeBranchId }
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

        if (product && product.isDeleted) {
            return null;
        }

        if (product) {
            product.skus = product.skus.map(sku => {
                const branchInv = sku.branchInventory && sku.branchInventory[0];
                return {
                    ...sku,
                    stock: branchInv ? branchInv.stock : 0
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

            if (currencyCode) {
                const priceData = await PriceService.getProductPrice(product.id, currencyCode);
                product.price = priceData;
                product.currencyCode = currencyCode;

                const basePrice = parseFloat(product.basePrice.toString());
                // ratio = Target/Base. If we multiply Base * ratio we get Target.
                const scalingRatio = basePrice > 0 ? (priceData / basePrice) : 1.0;

                product.skus = product.skus.map(sku => ({
                    ...sku,
                    price: parseFloat(sku.price.toString()) * scalingRatio
                }));
            }
            const discountInfo = await DiscountService.getDiscountForProduct(product, {
                currencyCode: currencyCode,
                branchId: 1
            });

            product.discountedPrice = discountInfo.discountedPrice;
            product.discountPercentage = discountInfo.discountPercentage;

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
                    pointsValue: data.pointsValue !== undefined ? parseInt(data.pointsValue) : undefined,
                    pointsReward: data.pointsReward !== undefined ? parseInt(data.pointsReward) : undefined,
                    images: data.images,
                    categoryId: data.categoryId ? parseInt(data.categoryId) : undefined,
                    isActive: data.isActive,
                    measurementUnit: data.measurementUnit,
                    allowFractional: data.allowFractional,
                    condition: data.condition,
                    qr: data.qr === "" ? null : data.qr,
                    isTrending: data.isTrending,
                    isRecommended: data.isRecommended,
                    isNew: data.isNew,
                    characteristics: data.characteristics !== undefined ? data.characteristics : undefined,
                    specifications: data.specifications !== undefined ? data.specifications : undefined,
                    youtubeVideo: data.youtubeVideo !== undefined ? data.youtubeVideo : undefined,
                    nutritionalInfo: data.nutritionalInfo !== undefined ? data.nutritionalInfo : undefined,
                    octagonsImage: data.octagonsImage !== undefined ? data.octagonsImage : undefined,
                    taxRate: data.taxRate !== undefined ? (data.taxRate === "" || data.taxRate === null || isNaN(parseFloat(data.taxRate)) ? null : parseFloat(data.taxRate)) : undefined
                },
                include: { category: true }
            });

            if (data.costPrice !== undefined) {
                await tx.sKU.updateMany({
                    where: { productId: parseInt(id) },
                    data: { costPrice: data.costPrice }
                });
            }

            if (data.adminId) {
                const changes = {};
                Object.keys(data).forEach(k => {
                    if (['adminId', 'ip', 'branchId', 'variants', 'skus'].includes(k)) return;
                    if (product[k] !== data[k]) {
                        changes[k] = { prev: product[k], new: data[k] };
                    }
                });

                if (Object.keys(changes).length > 0) {
                    await AuditService.logAction({
                        adminId: data.adminId,
                        action: 'UPDATE_PRODUCT',
                        entityType: 'PRODUCT',
                        entityId: id,
                        branchId: data.branchId || null,
                        changes,
                        ip: data.ip
                    });
                }
            }

            // 2. Administrar Nuevas Variantes (Si fueron proveidas)
            if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
                for (const variant of data.variants) {
                    if (variant.id) continue;

                    const skuCode = variant.code || `${id}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

                    const existing = await tx.sKU.findFirst({ where: { productId: parseInt(id), code: skuCode } });
                    if (existing) continue;

                    const newSku = await tx.sKU.create({
                        data: {
                            productId: parseInt(id),
                            code: skuCode,
                            price: variant.price || data.basePrice,
                            costPrice: variant.costPrice || data.costPrice || 0,
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
    async deleteProduct(id, adminId = null, ip = null, branchId = null) {
        return await prisma.$transaction(async (tx) => {
            const productId = parseInt(id);

            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) throw new Error('Producto no encontrado');
            if (product.isDeleted) throw new Error('Este producto ya fue eliminado.');

            const reservasPendientes = await tx.stockReservation.count({
                where: { sku: { productId }, released: false, expiresAt: { gt: new Date() } }
            });
            if (reservasPendientes > 0) throw new Error('No se puede eliminar el producto porque tiene reservas activas.');

            const transferenciasActivas = await tx.stockTransferItem.count({
                where: { sku: { productId }, transfer: { status: { in: ['PENDING', 'IN_TRANSIT'] } } }
            });
            if (transferenciasActivas > 0) throw new Error('No se puede eliminar el producto porque está en una transferencia.');

            const deletedProduct = await tx.product.update({
                where: { id: productId },
                data: { isDeleted: true, isActive: false }
            });

            await tx.sKU.updateMany({
                where: { productId },
                data: { active: false }
            });

            await tx.branchInventory.updateMany({
                where: { sku: { productId } },
                data: { isActive: false }
            });

            const cartItemsToRemove = await tx.cartItem.findMany({
                where: { sku: { productId } },
                select: { id: true }
            });
            if (cartItemsToRemove.length > 0) {
                await tx.cartItem.deleteMany({
                    where: { id: { in: cartItemsToRemove.map(c => c.id) } }
                });
            }

            if (adminId) {
                await AuditService.logAction({
                    adminId,
                    action: 'DELETE_PRODUCT',
                    entityType: 'PRODUCT',
                    entityId: id,
                    branchId: branchId || null,
                    changes: { status: 'SOFT_DELETED' },
                    ip
                });
            }
            return deletedProduct;
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
                isActive: true,
                isDeleted: false
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
                    where: { id: { in: sortedProductIds }, isActive: true, isDeleted: false },
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

    /**
     * IMPORTACIÓN MASIVA DE PRODUCTOS
     * Procesa un array de productos desde Excel/CSV
     */
    async bulkCreateProducts(productsData, context = {}) {
        const results = {
            created: 0,
            updated: 0,
            errors: []
        };

        const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });

        for (const item of productsData) {
            try {
                // 1. Normalizar y buscar Categoría
                const catName = item.Categoria || item.Category || 'General';
                const catSlug = catName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
                
                let category = await prisma.category.findUnique({ where: { slug: catSlug } });
                if (!category) {
                    category = await prisma.category.create({
                        data: { name: catName, slug: catSlug }
                    });
                }

                // 2. Transacción por producto para evitar fallos catastróficos en el lote
                await prisma.$transaction(async (tx) => {
                    // Buscar si existe el SKU
                    const skuCode = String(item.Codigo_SKU || item.SKU || `${item.Nombre}-DEF`).trim();
                    const existingSku = await tx.sKU.findUnique({ where: { code: skuCode } });

                    if (existingSku) {
                        // ACTUALIZAR SI YA EXISTE (UPSERT)
                        // Obtener datos actuales para fusionar
                        const existingProduct = await tx.product.findUnique({ where: { id: existingSku.productId } });
                        
                        const sku = await tx.sKU.update({
                            where: { id: existingSku.id },
                            data: {
                                price: item.Precio_SKU ? parseFloat(item.Precio_SKU) : (item.Precio_Base ? parseFloat(item.Precio_Base) : existingSku.price),
                                barcode: item.Codigo_Barras ? String(item.Codigo_Barras) : existingSku.barcode,
                                product: {
                                    update: {
                                        basePrice: item.Precio_Base ? parseFloat(item.Precio_Base) : (item.Precio ? parseFloat(item.Precio) : existingProduct.basePrice),
                                        description: item.Descripcion ? String(item.Descripcion) : existingProduct.description,
                                        brand: item.Marca ? String(item.Marca) : existingProduct.brand,
                                        measurementUnit: item.Unidad_Medida ? String(item.Unidad_Medida) : existingProduct.measurementUnit
                                    }
                                }
                            }
                        });

                        // Actualizar inventario en la sucursal activa si se provee context.branchId
                        if (context.branchId && item.Stock_Inicial !== undefined) {
                            await tx.branchInventory.upsert({
                                where: {
                                    skuId_branchId: {
                                        skuId: sku.id,
                                        branchId: context.branchId
                                    }
                                },
                                update: { stock: parseFloat(item.Stock_Inicial) },
                                create: {
                                    skuId: sku.id,
                                    branchId: context.branchId,
                                    stock: parseFloat(item.Stock_Inicial),
                                    price: sku.price
                                }
                            });
                        }
                        
                        results.updated++;
                        return; // Salir de la transacción para este item (ya procesado como update)
                    }

                    // Crear Producto si no existe el SKU
                    const product = await tx.product.create({
                        data: {
                            name: String(item.Nombre || 'Sin Nombre'),
                            brand: String(item.Marca || 'Genérico'),
                            description: String(item.Descripcion || ''),
                            basePrice: parseFloat(item.Precio_Base || item.Precio || 0),
                            type: String(item.Tipo || 'SIMPLE'),
                            categoryId: category.id,
                            measurementUnit: String(item.Unidad_Medida || 'UNIDAD'),
                            isActive: true,
                        }
                    });

                    // Crear SKU
                    const sku = await tx.sKU.create({
                        data: {
                            productId: product.id,
                            code: skuCode,
                            price: parseFloat(item.Precio_SKU || item.Precio_Base || 0),
                            stock: parseFloat(item.Stock_Inicial || 0),
                            barcode: item.Codigo_Barras ? String(item.Codigo_Barras) : null,
                        }
                    });

                    // Inicializar Inventario en sucursales
                    const inventoryData = branches.map(b => ({
                        skuId: sku.id,
                        branchId: b.id,
                        stock: b.id === context.branchId ? parseFloat(item.Stock_Inicial || 0) : 0,
                        price: sku.price,
                    }));

                    await tx.branchInventory.createMany({ data: inventoryData });

                    if (context.adminId) {
                        await AuditService.logAction({
                            adminId: context.adminId,
                            action: 'BULK_IMPORT_PRODUCT',
                            entityType: 'PRODUCT',
                            entityId: product.id,
                            branchId: context.branchId || null,
                            changes: { item },
                            ip: context.ip
                        });
                    }
                });

                results.created++;
            } catch (err) {
                results.errors.push({
                    item: item.Nombre || 'Desconocido',
                    error: err.message
                });
            }
        }

        return results;
    }
}

module.exports = new ProductService();
