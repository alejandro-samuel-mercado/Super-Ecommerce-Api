const prisma = require('../config/prisma');

class CartService {

    /**
     * Obtener o crear un carrito para el usuario.
     * @param {number} userId 
     * @returns {Promise<Object>} Carrito con items
     */
    async getCart(userId, currencyCode) {
        let cart = null;
        
        if (userId) {
            cart = await prisma.cart.findUnique({
                where: { userId: parseInt(userId) },
                include: { 
                    items: {
                        include: {
                            sku: {
                                include: {
                                    product: true,
                                    variantOptions: true
                                }
                            }
                        }
                    }
                }
            });

            if (!cart) {
                cart = await prisma.cart.create({
                    data: { userId: parseInt(userId) },
                    include: { items: true }
                });
            }
        }

        if (cart && currencyCode) {
            const PriceService = require('./price.service');
            const skuIds = cart.items.map(item => item.skuId);
            const pricesMap = await PriceService.getMultipleSkuPrices(skuIds, currencyCode);
            
            cart.items = cart.items.map(item => ({
                ...item,
                convertedPrice: pricesMap[item.skuId] || null,
                sku: {
                    ...item.sku,
                    price: pricesMap[item.skuId] || item.sku.price
                }
            }));
        }

        return cart;
    }

    /**
     * Agregar item al carrito o actualizar cantidad si existe.
     * @param {number} userId 
     * @param {number} skuId 
     * @param {number} quantity 
     */
    async addToCart(userId, skuId, quantity) {
        const cart = await this.getCart(userId);
        const skuIdInt = parseInt(skuId);
        const qty = parseFloat(quantity);
        if (!qty || qty <= 0) throw new Error('Cantidad inválida');

        const skuExists = await prisma.sKU.findUnique({ 
            where: { id: skuIdInt }, 
            include: { product: { select: { measurementUnit: true } } } 
        });
        if (!skuExists) throw new Error('El producto no fue encontrado');
        
        if (skuExists.product?.measurementUnit === 'UNIDAD' && !Number.isInteger(qty)) {
            throw new Error(`Cantidad fraccionaria no permitida para venta por unidad`);
        }

        // Validar si el item existe en el carrito
        const existingItem = await prisma.cartItem.findUnique({
            where: {
                cartId_skuId: {
                    cartId: cart.id,
                    skuId: skuIdInt
                }
            }
        });

        if (existingItem) {
            return await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: parseFloat(existingItem.quantity.toString()) + qty }
            });
        } else {
            return await prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    skuId: skuIdInt,
                    quantity: qty
                }
            });
        }
    }

    /**
     * Eliminar item del carrito.
     * @param {number} userId 
     * @param {number} skuId 
     */
    async removeFromCart(userId, skuId) {
        const cart = await this.getCart(userId);
        const skuIdInt = parseInt(skuId);

        try {
            return await prisma.cartItem.delete({
                where: {
                    cartId_skuId: {
                        cartId: cart.id,
                        skuId: skuIdInt
                    }
                }
            });
        } catch (e) {
           
            return null;
        }
    }

    /**
     * Actualizar cantidad de item directamente.
     * @param {number} userId 
     * @param {number} skuId 
     * @param {number} quantity 
     */
    async updateItem(userId, skuId, quantity) {
        const cart = await this.getCart(userId);
        const skuIdInt = parseInt(skuId);
        const qty = parseFloat(quantity);

        if (!qty || qty <= 0) {
            return this.removeFromCart(userId, skuId);
        }

        return await prisma.cartItem.upsert({
            where: {
                cartId_skuId: {
                    cartId: cart.id,
                    skuId: skuIdInt
                }
            },
            update: { quantity: qty },
            create: {
                cartId: cart.id,
                skuId: skuIdInt,
                quantity: qty
            }
        });
    }

    /**
     * Fusionar items del carrito local con la DB.
     * @param {number} userId 
     * @param {Array<{skuId: number, quantity: number}>} localItems 
     */
    async mergeCart(userId, localItems, currencyCode) {
        const PriceService = require('./price.service');
        const stockAdjustments = [];
        
        if (userId) {
            const cart = await this.getCart(userId);

            for (const item of localItems) {
                 const skuIdInt = parseInt(item.skuId);
                 const qty = parseFloat(item.quantity);
                 if (!qty || qty <= 0) continue;

                 await prisma.cartItem.upsert({
                     where: {
                         cartId_skuId: {
                             cartId: cart.id,
                             skuId: skuIdInt
                         }
                     },
                     update: {
                         quantity: { increment: qty }
                     },
                     create: {
                         cartId: cart.id,
                         skuId: skuIdInt,
                         quantity: qty
                     }
                 });
            }

            const updatedCart = await prisma.cart.findUnique({
                where: { userId: parseInt(userId) },
                include: {
                    items: {
                        include: {
                            sku: {
                                include: {
                                    product: true,
                                    variantOptions: true,
                                    branchInventory: { take: 1 }
                                }
                            }
                        }
                    }
                }
            });

            if (updatedCart) {
                for (const cartItem of updatedCart.items) {
                    const stock = cartItem.sku.branchInventory?.[0]?.stock;
                    const currentQty = parseFloat(cartItem.quantity.toString());
                    
                    if (stock !== undefined && stock !== null && currentQty > Number(stock)) {
                        const cappedQty = Math.max(Number(stock), 0);
                        
                        if (cappedQty <= 0) {
                            await prisma.cartItem.delete({ where: { id: cartItem.id } });
                        } else {
                            await prisma.cartItem.update({
                                where: { id: cartItem.id },
                                data: { quantity: cappedQty }
                            });
                        }
                        
                        stockAdjustments.push({
                            skuId: cartItem.skuId,
                            productName: cartItem.sku.product?.name || 'Producto',
                            requestedQty: currentQty,
                            availableStock: Number(stock),
                            adjustedQty: cappedQty
                        });
                    }
                }
            }

            const finalCart = await this.getCart(userId, currencyCode);
            return { ...finalCart, stockAdjustments };
        } else {
            const items = [];
            for (const item of localItems) {
                const skuIdInt = parseInt(item.skuId);
                const sku = await prisma.sKU.findUnique({
                    where: { id: skuIdInt },
                    include: { product: true, variantOptions: true }
                });
                
                if (sku) {
                    const qty = parseFloat(item.quantity);
                    if (sku.product?.measurementUnit === 'UNIDAD' && !Number.isInteger(qty)) { continue; }
                    
                    const price = await PriceService.getSkuPrice(skuIdInt, currencyCode);
                    items.push({
                        skuId: skuIdInt,
                        quantity: parseFloat(item.quantity),
                        sku: { ...sku, price }
                    });
                }
            }
            return { items, stockAdjustments };
        }
    }
    
    /**
     * Limpiar o vaciar el carrito
     */
    async clearCart(userId) {
        const cart = await this.getCart(userId);
        await prisma.cartItem.deleteMany({
            where: { cartId: cart.id }
        });
        return { success: true };
    }
}

module.exports = new CartService();
