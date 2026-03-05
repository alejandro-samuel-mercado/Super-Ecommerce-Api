const prisma = require('../config/prisma');
const EventService = require('../services/event.service');
const AuditService = require('../services/audit.service');


class PromoController {

  // --- EVENTS ---
  async createEvent(req, res, next) {
      try {
          const event = await EventService.createEvent(req.body);
          
          await AuditService.logAction({
              adminId: req.user.id,
              action: 'CREATE_EVENT',
              entityType: 'PROMO_EVENT',
              entityId: event.id,
              changes: req.body,
              ip: req.ip
          });

          res.status(201).json({ success: true, data: event });

      } catch (error) {
          next(error);
      }
  }

  async getEvents(req, res, next) {
      try {
          const events = await EventService.getAllEvents();
          res.json({ success: true, data: events });
      } catch (error) {
          next(error);
      }
  }

  async updateEvent(req, res, next) {
      try {
          const { id } = req.params;
          const event = await EventService.updateEvent(id, req.body);
          
        
          await AuditService.logAction({
              adminId: req.user.id,
              action: 'UPDATE_EVENT',
              entityType: 'PROMO_EVENT',
              entityId: id,
              changes: req.body,
              ip: req.ip
          });

          res.json({ success: true, data: event });

      } catch (error) {
          next(error);
      }
  }

  async deleteEvent(req, res, next) {
      try {
          const { id } = req.params;
          await EventService.deleteEvent(id);
          
         
          await AuditService.logAction({
              adminId: req.user.id,
              action: 'DELETE_EVENT',
              entityType: 'PROMO_EVENT',
              entityId: id,
              ip: req.ip
          });

          res.json({ success: true, message: 'Evento eliminado' });

      } catch (error) {
          next(error);
      }
  }

  // --- DISCOUNTS ---
  async createDiscount(req, res, next) {
      try {
          const { 
            name, type, value, scope, targetIds, rules, 
            mode, stackable, active, priority, eventId,
            validFrom, validUntil
          } = req.body;

          if (type === 'PERCENTAGE' && (parseFloat(value) <= 0 || parseFloat(value) > 100)) {
              return res.status(400).json({ success: false, message: 'El valor del descuento porcentual debe estar entre 0 y 100.' });
          }

          const discount = await prisma.discount.create({
              data: {
                name,
                type,
                value,
                scope,
                targetIds,
                rules,
                mode,
                stackable,
                active,
                priority,
                eventId,
                validFrom: validFrom ? new Date(validFrom) : undefined,
                validUntil: validUntil ? new Date(validUntil) : undefined
              }
          });
          
         
          await AuditService.logAction({
              adminId: req.user.id,
              action: 'CREATE_DISCOUNT',
              entityType: 'DISCOUNT',
              entityId: discount.id,
              changes: req.body,
              ip: req.ip
          });

          res.status(201).json({ success: true, data: discount });

      } catch (error) {
          next(error);
      }
  }

  async getDiscounts(req, res, next) {
      try {
          const discounts = await prisma.discount.findMany({
              include: { event: true }
          });
          res.json({ success: true, data: discounts });
      } catch (error) {
          next(error);
      }
  }
  
  async deleteDiscount(req, res, next) {
      try {
          const { id } = req.params;
          await prisma.discount.delete({ where: { id: parseInt(id) } });

          await AuditService.logAction({
              adminId: req.user.id,
              action: 'DELETE_DISCOUNT',
              entityType: 'DISCOUNT',
              entityId: id,
              ip: req.ip
          });

          res.json({ success: true, message: 'Descuento eliminado' });

      } catch (error) {
          next(error);
      }
  }

  async updateDiscount(req, res, next) {
      try {
          const { id } = req.params;
          const { 
            name, type, value, scope, targetIds, rules, 
            mode, stackable, active, priority, eventId,
            validFrom, validUntil
          } = req.body;

          if (type === 'PERCENTAGE' && (parseFloat(value) <= 0 || parseFloat(value) > 100)) {
              return res.status(400).json({ success: false, message: 'El valor del descuento porcentual debe estar entre 0 y 100.' });
          }

          const discount = await prisma.discount.update({
              where: { id: parseInt(id) },
              data: {
                name,
                type,
                value,
                scope,
                targetIds,
                rules,
                mode,
                stackable,
                active,
                priority,
                eventId,
                validFrom: validFrom ? new Date(validFrom) : undefined,
                validUntil: validUntil ? new Date(validUntil) : undefined
              }
          });
          
        
          await AuditService.logAction({
              adminId: req.user.id,
              action: 'UPDATE_DISCOUNT',
              entityType: 'DISCOUNT',
              entityId: id,
              changes: req.body,
              ip: req.ip
          });

          res.json({ success: true, data: discount });

      } catch (error) {
          next(error);
      }
  }
}

module.exports = new PromoController();
