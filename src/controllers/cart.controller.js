const CartService = require('../services/cart.service');

class CartController {

    async getCart(req, res) {
        try {
            const userId = req.user?.id;
            const currency = req.headers['x-currency'] || req.query.currency;
            const cart = await CartService.getCart(userId, currency);
            res.json(cart);
        } catch (error) {
            console.error('Error getting cart:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async addItem(req, res) {
        try {
            const userId = req.user.id;
            const { skuId, quantity } = req.body;
            const result = await CartService.addToCart(userId, skuId, quantity);
            res.json(result);
        } catch (error) {
            console.error('Error adding to cart:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async removeItem(req, res) {
        try {
            const userId = req.user.id;
            const { skuId } = req.params;
            const result = await CartService.removeFromCart(userId, skuId);
            res.json(result);
        } catch (error) {
            console.error('Error removing from cart:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updateItem(req, res) {
        try {
            const userId = req.user.id;
            const { skuId, quantity } = req.body;
            const result = await CartService.updateItem(userId, skuId, quantity);
            res.json(result);
        } catch (error) {
            console.error('Error updating cart item:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async mergeCart(req, res) {
        try {
            const userId = req.user?.id;
            const { items } = req.body; 
            const currency = req.headers['x-currency'] || req.query.currency;
            const cart = await CartService.mergeCart(userId, items, currency);
            res.json(cart);
        } catch (error) {
            console.error('Error merging cart:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async clearCart(req, res) {
         try {
            const userId = req.user.id;
            const result = await CartService.clearCart(userId);
            res.json(result);
         } catch (error) {
             console.error('Error clearing cart:', error);
             res.status(500).json({ error: error.message });
         }
    }
}

module.exports = new CartController();
