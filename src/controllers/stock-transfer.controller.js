const StockTransferService = require('../services/stock-transfer.service');

class StockTransferController {

  async getAll(req, res, next) {
    try {
    
      const transfers = await StockTransferService.getAll(req.query);
      res.json({ success: true, data: transfers });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const transfer = await StockTransferService.getById(id);
      res.json({ success: true, data: transfer });
    } catch (error) {
       if (error.message.includes('No encontrada')) return res.status(404).json({ success: false, message: error.message });
       next(error);
    }
  }

  async create(req, res, next) {
    try {
      const { id: userId } = req.user;
      const transfer = await StockTransferService.createRequest(req.body, userId);
      res.status(201).json({ success: true, message: 'Solicitud de transferencia creada', data: transfer });
    } catch (error) {
      if (error.message.includes('insuficiente') || error.message.includes('iguales')) {
          return res.status(400).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async ship(req, res, next) {
    try {
      const { id } = req.params;
      const { id: userId } = req.user;
      const transfer = await StockTransferService.shipTransfer(id, userId);
      res.json({ success: true, message: 'Transferencia enviada', data: transfer });
    } catch (error) {
       if (error.message.includes('no está en estado')) return res.status(409).json({ success: false, message: error.message });
       next(error);
    }
  }

  async receive(req, res, next) {
      try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const transfer = await StockTransferService.receiveTransfer(id, userId);
        res.json({ success: true, message: 'Transferencia recibida y stock actualizado', data: transfer });
      } catch (error) {
         if (error.message.includes('no está')) return res.status(409).json({ success: false, message: error.message });
         next(error);
      }
  }

  async cancel(req, res, next) {
      try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const transfer = await StockTransferService.cancelTransfer(id, userId);
        res.json({ success: true, message: 'Transferencia cancelada', data: transfer });
      } catch (error) {
          if (error.message.includes('No se puede')) return res.status(409).json({ success: false, message: error.message });
          next(error);
      }
  }
}

module.exports = new StockTransferController();
