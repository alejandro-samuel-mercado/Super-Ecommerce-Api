const ReportService = require('../services/report.service');

class ReportController {

  async getFinancialStats(req, res, next) {
    try {
      const stats = await ReportService.getFinancialStats({ ...req.query, branchId: req.branchId });
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  async getStockValuation(req, res, next) {
    try {
      const valuation = await ReportService.getStockValuation({ ...req.query, branchId: req.branchId });
      res.json({ success: true, data: valuation });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();
