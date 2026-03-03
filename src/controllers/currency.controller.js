const CurrencyService = require('../services/currency.service');

class CurrencyController {
  async getAll(req, res, next) {
    try {
      const onlyActive = req.query.active === 'true';
      const currencies = await CurrencyService.getAllCurrencies(onlyActive);
      res.json({ success: true, data: currencies });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req, res, next) {
    try {
      const currency = await CurrencyService.getCurrencyByCode(req.params.code);
      if (!currency) return res.status(404).json({ success: false, message: 'Currency not found' });
      res.json({ success: true, data: currency });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const currency = await CurrencyService.createCurrency(req.body);
      res.status(201).json({ success: true, data: currency });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const currency = await CurrencyService.updateCurrency(req.params.id, req.body);
      res.json({ success: true, data: currency });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await CurrencyService.deleteCurrency(req.params.id);
      res.json({ success: true, message: 'Currency deleted successfully' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new CurrencyController();
