const ExpenseService = require('../services/expense.service');
const UploadService = require('../services/upload.service');
const { validationResult } = require('express-validator');

class ExpenseController {
    async create(req, res, next) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, errors: errors.array() });
            }

            const data = { ...req.body };
            if (req.file) {
                const invoiceUrl = await UploadService.uploadImage(req.file.buffer, 'expenses');
                data.invoiceUrl = invoiceUrl;
            }

            const adminId = req.user.id;
            const ip = req.ip || req.connection.remoteAddress;
            const expense = await ExpenseService.create(data, adminId, ip);
            res.status(201).json({ success: true, data: expense });
        } catch (error) {
            next(error);
        }
    }

    async findAll(req, res, next) {
        try {
            const data = await ExpenseService.findAll(req.query);
            res.json({ success: true, ...data });
        } catch (error) {
            next(error);
        }
    }

    async getById(req, res, next) {
        try {
            const expense = await ExpenseService.getById(req.params.id);
            if (!expense) {
                return res.status(404).json({ success: false, message: 'Gasto no encontrado' });
            }
            res.json({ success: true, data: expense });
        } catch (error) {
            next(error);
        }
    }

    async delete(req, res, next) {
        try {
            const adminId = req.user.id;
            const ip = req.ip || req.connection.remoteAddress;
            await ExpenseService.delete(req.params.id, adminId, ip);
            res.json({ success: true, message: 'Gasto eliminado exitosamente' });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ExpenseController();
