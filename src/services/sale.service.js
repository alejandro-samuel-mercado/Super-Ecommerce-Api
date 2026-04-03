const SaleCreationService = require("./sale-creation.service");
const SalePreviewService = require("./sale-preview.service");
const SalePaymentService = require("./sale-payment.service");
const SaleQueryService = require("./sale-query.service");
const SaleLifecycleService = require("./sale-lifecycle.service");

class SaleService {
    async findRecentDuplicate(userId, items, currencyCode) {
        return SaleCreationService.findRecentDuplicate(userId, items, currencyCode);
    }

    async createSale(userId, saleData) {
        return SaleCreationService.createSale(userId, saleData);
    }

    async previewSale(saleData, userId) {
        return SalePreviewService.previewSale(saleData, userId);
    }

    async processPostPaymentActions(saleId) {
        return SalePaymentService.processPostPaymentActions(saleId);
    }

    async getSaleById(id, userId, role) {
        return SaleQueryService.getSaleById(id, userId, role);
    }

    async getSaleByUuid(uuid) {
        return SaleQueryService.getSaleByUuid(uuid);
    }

    async getAllSales(filters) {
        return SaleQueryService.getAllSales(filters);
    }

    async getUserSales(userId, includePending) {
        return SaleQueryService.getUserSales(userId, includePending);
    }

    async updateSale(id, data, roleName, userId) {
        return SaleLifecycleService.updateSale(id, data, roleName, userId);
    }

    async cancelSale(id, userId, roleName) {
        return SaleLifecycleService.cancelSale(id, userId, roleName);
    }

    async cleanupAbandonedSales() {
        return SaleLifecycleService.cleanupAbandonedSales();
    }
}

module.exports = new SaleService();
