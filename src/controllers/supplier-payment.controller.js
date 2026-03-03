const SupplierPaymentService = require('../services/supplier-payment.service');

class SupplierPaymentController {
    
    async create(req, res) {
        try {
            const payment = await SupplierPaymentService.create(req.body, req.user.id);
            res.status(201).json({ success: true, data: payment });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async getAll(req, res) {
        try {
            const payments = await SupplierPaymentService.getAll(req.query);
            res.json({ success: true, data: payments });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new SupplierPaymentController();
