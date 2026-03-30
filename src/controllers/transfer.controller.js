const TransferService = require('../services/transfer.service');
const { ensureAbsoluteUrl } = require('../utils/url.util');

const mapTransferUrls = (transfer, req) => {
  if (!transfer) return transfer;
  const t = { ...transfer };
  if (t.proofUrl) t.proofUrl = ensureAbsoluteUrl(t.proofUrl, req);
  return t;
};

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

      const baseUrl = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
      const transfer = await TransferService.createTransfer(userId, amount, req.file.buffer, branchId, baseUrl);

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
      const { page, limit } = req.query;
      const result = await TransferService.getAllTransfers({ branchId, page, limit });
      const mappedResult = {
        ...result,
        data: result.data.map(t => mapTransferUrls(t, req))
      };
      res.status(200).json({ success: true, data: mappedResult });
    } catch (error) {
      next(error);
    }
  }

  async getMyTransfers(req, res, next) {
    try {
      const transfers = await TransferService.getUserTransfers(req.user.id);
      const mappedTransfers = transfers.map(t => mapTransferUrls(t, req));
      res.status(200).json({ success: true, data: mappedTransfers });
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
      res.status(200).json({ success: true, data: mapTransferUrls(updated, req) });
    } catch (error) {
       next(error);
    }
  }
}

module.exports = new TransferController();
