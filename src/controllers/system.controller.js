const LoggerService = require('../services/logger.service');
const prisma = require('../config/prisma');

class SystemController {
  
  /**
 
   * POST /api/system/report-error
   */
  async reportError(req, res, next) {
    try {
      const { message, stack, component, url, browserInfo, userContext } = req.body;
      
   
      if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

   
      const logId = await LoggerService.log({
          message: `[CLIENT REPORT] ${message}`,
          stack: stack,
          code: 'CLIENT_ERROR'
      }, {
          component,
          url,
          browserInfo,
          reportedBy: userContext 
      }, 'MEDIUM');

      res.status(200).json({ success: true, reference_id: logId });
    } catch (error) {
      next(error);
    }
  }

  /**
  
   * GET /api/system/status
   */
  async getSystemStatus(req, res, next) {
    try {
        
        await prisma.$queryRaw`SELECT 1`;

        const activeAlerts = await prisma.errorLog.count({
            where: { 
                severity: { in: ['HIGH', 'CRITICAL'] },
                status: 'OPEN',
                updatedAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } 
            }
        });

        res.json({
            status: activeAlerts > 0 ? 'WARNING' : 'OK',
            active_alerts: activeAlerts,
            timestamp: new Date()
        });
    } catch (error) {
       
        next(error);
    }
  }

  /**
   * Get Alerts (Admin)
   */
  async getAlerts(req, res, next) {
      try {
          const { 
              status, 
              severity, 
              page = 1, 
              pageSize = 20, 
              sortBy = 'updatedAt', 
              sortOrder = 'desc',
              startDate,
              endDate
          } = req.query;
          
          const skip = (parseInt(page) - 1) * parseInt(pageSize);
          const take = parseInt(pageSize);

          const where = {};
          if (status) where.status = status;
          if (severity) where.severity = severity;
          
          if (startDate || endDate) {
              where.updatedAt = {};
              if (startDate) where.updatedAt.gte = new Date(startDate);
              if (endDate) where.updatedAt.lte = new Date(endDate);
          }

          const [logs, total] = await Promise.all([
              prisma.errorLog.findMany({
                  where,
                  orderBy: { [sortBy]: sortOrder },
                  skip,
                  take
              }),
              prisma.errorLog.count({ where })
          ]);
          
          res.json({ 
              success: true, 
              data: logs,
              pagination: {
                  total,
                  page: parseInt(page),
                  pageSize: parseInt(pageSize),
                  totalPages: Math.ceil(total / take)
              }
          });
      } catch (error) {
          next(error);
      }
  }

  /**
   * PATCH /api/system/alerts/:id/resolve
   */
  async resolveAlert(req, res, next) {
      try {
          const { id } = req.params;
          
          await prisma.errorLog.update({
              where: { id: parseInt(id) },
              data: { status: 'RESOLVED' }
          });
          
          res.json({ success: true, message: 'Alerta marcada como resuelta' });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new SystemController();
