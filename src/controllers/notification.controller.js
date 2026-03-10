const NotificationService = require('../services/in-app-notification.service');

class NotificationController {
  
  async getNotifications(req, res, next) {
    try {
      let branchId = req.branchId;
      const roleName = req.user.role.name || req.user.role;

      if (roleName === 'EMPLOYEE') {
          const userProfile = await require('../services/user.service').getProfile(req.user.id);
          if (userProfile && userProfile.branchId) {
              branchId = userProfile.branchId;
          }
      }

      const notifications = await NotificationService.getNotifications(req.user.id, 20, branchId);
      res.status(200).json({ success: true, data: notifications });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      await NotificationService.markAsRead(req.user.id, id);
      res.status(200).json({ success: true, message: 'Notificaciones marcadas como leidas' });
    } catch (error) {
      next(error);
    }
  }

  async deleteNotification(req, res, next) {
    try {
        const { id } = req.params;
        await NotificationService.deleteNotification(req.user.id, id);
        res.status(200).json({ success: true, message: 'Notificación eliminada' });
    } catch (error) {
        next(error);
    }
  }
}

module.exports = new NotificationController();
