const PurchaseService = require('../services/purchase.service');
const UploadService = require('../services/upload.service');

class PurchaseController {
    
    async getAll(req, res) {
        try {
            const result = await PurchaseService.getAll(req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getById(req, res) {
        try {
            const purchase = await PurchaseService.getById(req.params.id);
            res.json({ success: true, data: purchase });
        } catch (error) {
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async create(req, res) {
        try {
            const data = { ...req.body };
            if (req.file) {
                const invoiceUrl = await UploadService.uploadImage(req.file.buffer, 'purchases');
                data.invoiceUrl = invoiceUrl;
            }
            // Parse items if they come as string (common with multipart/form-data)
            if (typeof data.items === 'string') {
                data.items = JSON.parse(data.items);
            }
            const purchase = await PurchaseService.create(data, req.user.id);
            res.status(201).json({ success: true, data: purchase });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async confirm(req, res) {
        try {
            const purchase = await PurchaseService.confirm(req.params.id, req.user.id);
            res.json({ success: true, data: purchase });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async receive(req, res) {
         try {
            const purchase = await PurchaseService.receive(req.params.id, req.user.id);
            res.json({ success: true, data: purchase });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async cancel(req, res) {
         try {
            const purchase = await PurchaseService.cancel(req.params.id, req.user.id);
            res.json({ success: true, data: purchase });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new PurchaseController();
