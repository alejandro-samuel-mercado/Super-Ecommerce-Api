const SupplierService = require('../services/supplier.service');
const AuditService = require('../services/audit.service');


class SupplierController {
    
    async getAll(req, res) {
        try {
            const result = await SupplierService.findAll(req.query);
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getById(req, res) {
        try {
            const supplier = await SupplierService.findById(req.params.id);
            res.json({ success: true, data: supplier });
        } catch (error) {
            res.status(404).json({ success: false, message: error.message });
        }
    }

    async create(req, res) {
        try {
         
            if (req.user.role.name !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, message: 'Solo SUPER_ADMIN puede crear proveedores' });
            }
            
            const supplier = await SupplierService.create(req.body, req.user.id);

           
            await AuditService.logAction({
                adminId: req.user.id,
                action: 'CREATE_SUPPLIER',
                entityType: 'SUPPLIER',
                entityId: supplier.id,
                changes: req.body,
                ip: req.ip
            });

            res.status(201).json({ success: true, data: supplier });

        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    async update(req, res) {
        try {
             if (req.user.role.name !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, message: 'Solo SUPER_ADMIN puede editar proveedores' });
            }

            const supplier = await SupplierService.update(req.params.id, req.body, req.user.id);

            await AuditService.logAction({
                adminId: req.user.id,
                action: 'UPDATE_SUPPLIER',
                entityType: 'SUPPLIER',
                entityId: req.params.id,
                changes: req.body,
                ip: req.ip
            });

            res.json({ success: true, data: supplier });

        } catch (error) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
    
    // --- SKUs ---
    async addSku(req, res) {
        try {
             if (req.user.role.name !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, message: 'Solo SUPER_ADMIN puede gestionar SKUs de proveedores' });
            }

            const result = await SupplierService.addSku(req.params.id, req.body);

            await AuditService.logAction({
                adminId: req.user.id,
                action: 'LINK_SKU_SUPPLIER',
                entityType: 'SUPPLIER',
                entityId: req.params.id,
                changes: { skuId: req.body.skuId, costPrice: req.body.costPrice },
                ip: req.ip
            });

            res.status(201).json({ success: true, data: result });

        } catch (error) {
             res.status(400).json({ success: false, message: error.message });
        }
    }
    
    async removeSku(req, res) {
         try {
             if (req.user.role.name !== 'SUPER_ADMIN') {
                return res.status(403).json({ success: false, message: 'Solo SUPER_ADMIN puede eliminar SKUs de proveedores' });
            }

            await SupplierService.removeSku(req.params.id, req.params.skuId);

            await AuditService.logAction({
                adminId: req.user.id,
                action: 'UNLINK_SKU_SUPPLIER',
                entityType: 'SUPPLIER',
                entityId: req.params.id,
                changes: { skuId: req.params.skuId },
                ip: req.ip
            });

            res.json({ success: true, message: 'SKU eliminado del proveedor' });

        } catch (error) {
             res.status(400).json({ success: false, message: error.message });
        }
    }
}

module.exports = new SupplierController();
