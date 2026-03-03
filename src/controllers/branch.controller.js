const BranchService = require('../services/branch.service');

class BranchController {

  async getAll(req, res, next) {
    try {
      const branches = await BranchService.findAll(req.query);
      res.status(200).json({ success: true, data: branches });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const branch = await BranchService.findOne(id);
      
      if (!branch) return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });

      res.status(200).json({ success: true, data: branch });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const branch = await BranchService.create(req.body);
      res.status(201).json({ success: true, message: 'Sucursal creada exitosamente', data: branch });
    } catch (error) {
      if (error.message.includes('Ya existe')) {
         return res.status(409).json({ success: false, message: error.message });
      }
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const branch = await BranchService.update(id, req.body);
      res.status(200).json({ success: true, message: 'Sucursal actualizada', data: branch });
    } catch (error) {
      if (error.message === 'Sucursal no encontrada') {
         return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });
      }
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      await BranchService.delete(id);
      res.status(200).json({ success: true, message: 'Sucursal eliminada' });
    } catch (error) {
      if (error.message.includes('No se puede eliminar')) {
         return res.status(409).json({ success: false, message: error.message });
      }
      if (error.code === 'P2025') {
         return res.status(404).json({ success: false, message: 'Sucursal no encontrada' });
      }
      next(error);
    }
  }

  // Gestión de Usuarios
  async getUsers(req, res, next) {
      try {
          const { id } = req.params;
          const users = await BranchService.getUsers(id);
         
          const safeUsers = users.map(u => {
              const { password, ...rest } = u;
              return rest;
          });
          res.status(200).json({ success: true, data: safeUsers });
      } catch (error) {
          next(error);
      }
  }

  async addUser(req, res, next) {
      try {
          const { id } = req.params;
          const { userId } = req.body;
          await BranchService.addUser(id, userId, req.user?.id);
          res.status(200).json({ success: true, message: 'Usuario asignado correctamente' });
      } catch (error) {
          next(error);
      }
  }

  async removeUser(req, res, next) {
      try {
          const { id, userId } = req.params;
          await BranchService.removeUser(id, userId);
          res.status(200).json({ success: true, message: 'Usuario desvinculado correctamente' });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new BranchController();
