const TransferService = require('../services/transfer.service');

class TransferController {
  
  async createTransfer(req, res, next) {
    try {
      const { amount } = req.body;
      const userId = req.user.id; 
      const branchId = req.branchId;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Debe subir una imagen del comprobante' });
      }

      if (!amount) {
          return res.status(400).json({ success: false, message: 'Debe ingresar el monto' });
      }

      const transfer = await TransferService.createTransfer(userId, amount, req.file.buffer, branchId);

      res.status(201).json({
        success: true,
        data: transfer
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllTransfers(req, res, next) {
    try {
      const branchId = req.branchId;
      const transfers = await TransferService.getAllTransfers(branchId);
      res.status(200).json({ success: true, data: transfers });
    } catch (error) {
      next(error);
    }
  }

  async getMyTransfers(req, res, next) {
    try {
      const transfers = await TransferService.getUserTransfers(req.user.id);
      res.status(200).json({ success: true, data: transfers });
    } catch (error) {
      next(error);
    }
  }

  async updateTransferStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
          return res.status(400).json({ success: false, message: 'Estado inválido' });
      }

      const updated = await TransferService.updateStatus(id, status);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
       next(error);
    }
  }
}

module.exports = new TransferController();
