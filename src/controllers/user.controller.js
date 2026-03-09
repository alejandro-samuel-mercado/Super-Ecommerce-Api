const UserService = require('../services/user.service');

class UserController {

  async getProfile(req, res, next) {
    try {
      const user = await UserService.getProfile(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      
      const { password, ...safeUser } = user;
      res.status(200).json({ success: true, data: safeUser });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { name, email, phone, address, city, state, zipCode, profileImage } = req.body;
      const allowedUpdates = { name, email, phone, address, city, state, zipCode, profileImage };
      
      const filteredUpdates = Object.fromEntries(
        Object.entries(allowedUpdates).filter(([_, v]) => v !== undefined)
      );

      const updatedUser = await UserService.updateProfile(req.user.id, filteredUpdates);
      
      const { password, ...safeUser } = updatedUser;
      res.status(200).json({ success: true, message: 'Perfil actualizado', data: safeUser });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req, res, next) {
      try {
         
          const users = await UserService.getAllUsers();
          const safeUsers = users.map(u => {
              const { password, ...rest } = u;
              return rest;
          });
          res.status(200).json({ success: true, data: safeUsers });
      } catch (error) {
          next(error);
      }
  }

  // Admin: Crear Usuario (Empleado/Admin)
  async createUser(req, res, next) {
      try {
           const { role } = req.body;
           
           // Salvaguarda: Solo el Super Admin puede crear Admin/Super Admin
           if (['ADMIN', 'SUPER_ADMIN'].includes(role) && req.user.role.name !== 'SUPER_ADMIN') {
               return res.status(403).json({ success: false, message: 'No tienes permisos para crear administradores.' });
           }

           // Salvaguarda: El empleado SOLO puede crear CLIENTE
           if (req.user.role.name === 'EMPLOYEE' && role !== 'CUSTOMER') {
               return res.status(403).json({ success: false, message: 'Como empleado solo puedes registrar clientes' });
           }

           const newUser = await UserService.register({ ...req.body, adminId: req.user.id, ip: req.ip }, true);
           const { password, ...safeUser } = newUser;
           res.status(201).json({ success: true, data: safeUser });
      } catch (error) {
          next(error);
      }
  }

  // Admin: Actualizar Rol/Estado de Usuario
  async updateUserAdmin(req, res, next) {
      try {
          const { id } = req.params;
          const { role, status } = req.body;
          const targetUser = await UserService.getProfile(id);

          if (!targetUser) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

          // Salvaguarda: No se puede editar al Super Admin a menos que seas uno
          if (targetUser.role.name === 'SUPER_ADMIN' && req.user.role.name !== 'SUPER_ADMIN') {
               return res.status(403).json({ success: false, message: 'No puedes modificar a un Super Admin.' });
          }

          // Salvaguarda: El Admin no puede editar a otros Admins
          if (targetUser.role.name === 'ADMIN' && req.user.role.name !== 'SUPER_ADMIN') {
              return res.status(403).json({ success: false, message: 'Solo el Super Admin puede gestionar a otros administradores.' });
          }

          // Salvaguarda: No se puede ascender a Admin a menos que sea Super Admin
          if (role && ['ADMIN', 'SUPER_ADMIN'].includes(role) && req.user.role.name !== 'SUPER_ADMIN') {
              return res.status(403).json({ success: false, message: 'No tienes permisos para asignar roles administrativos.' });
          }

          // Si es empleado, solo puede editar a CLIENTE
          if (req.user.role.name === 'EMPLOYEE') {
              if (targetUser.role.name !== 'CUSTOMER') {
                  return res.status(403).json({ success: false, message: 'No tienes permiso para editar este perfil' });
              }
              if (role && role !== 'CUSTOMER') {
                  return res.status(403).json({ success: false, message: 'No puedes asignar roles superiores' });
              }
          }

           const updated = await UserService.updateProfile(id, { ...req.body, adminId: req.user.id, ip: req.ip });
          const { password, ...safeUser } = updated;
          res.status(200).json({ success: true, data: safeUser });
      } catch (error) {
          next(error);
      }
  }

  // Admin: Eliminar Usuario
  async deleteUser(req, res, next) {
      try {
          const { id } = req.params;
          const targetUser = await UserService.getProfile(id);
          
          if (!targetUser) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

          // Salvaguarda: No se puede eliminar al Super Admin
          if (targetUser.role.name === 'SUPER_ADMIN') {
              return res.status(403).json({ success: false, message: 'No se puede eliminar al Super Admin principal.' });
          }

          // Salvaguarda: El Admin no puede eliminar a otros Admins
          if (targetUser.role.name === 'ADMIN' && req.user.role.name !== 'SUPER_ADMIN') {
              return res.status(403).json({ success: false, message: 'No tienes permisos para eliminar administradores.' });
          }

          // Salvaguarda: El empleado SOLO puede eliminar CLIENTE
          if (req.user.role.name === 'EMPLOYEE' && targetUser.role.name !== 'CUSTOMER') {
              return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar este perfil' });
          }

           await UserService.deleteUser(id, req.user.id, req.ip);
          res.status(200).json({ success: true, message: 'Usuario eliminado correctamente' });
      } catch (error) {
          next(error);
      }
  }

  // Adaptador de Dirección (Dirección Única -> Array)
  async getAddresses(req, res, next) {
      try {
          const user = await UserService.getProfile(req.user.id);
          const addresses = user.address ? [{
              id: 'default',
              street: user.address,
              city: user.city,
              state: user.state || '',
              zip: user.zipCode || '',
              phone: user.phone || ''
          }] : [];
          
          res.status(200).json({ success: true, data: addresses });
      } catch (error) {
          next(error);
      }
  }

  async addAddress(req, res, next) {
      try {
           const { street, city, state, zip, phone } = req.body;
           
           await UserService.updateProfile(req.user.id, {
               address: street,
               city,
               state,
               zipCode: zip,
               phone
           });
           
           res.status(200).json({ success: true, message: 'Dirección actualizada' });
      } catch (error) {
          next(error);
      }
  }

  async deleteAddress(req, res, next) {
      try {
          await UserService.updateProfile(req.user.id, {
               address: null,
               city: null,
               state: null,
               zipCode: null,
               phone: null
           });
           res.status(200).json({ success: true, message: 'Dirección eliminada' });
      } catch (error) {
           next(error);
      }
  }

  // Favoritos
  async getFavorites(req, res, next) {
      try {
          const favorites = await UserService.getFavorites(req.user.id);
          res.status(200).json({ success: true, data: favorites });
      } catch (error) {
          next(error);
      }
  }

  async addFavorite(req, res, next) {
      try {
          const { productId } = req.params;
          if (!productId) return res.status(400).json({ success: false, message: 'ID de producto requerido' });
          
          await UserService.addFavorite(req.user.id, productId);
          res.status(200).json({ success: true, message: 'Añadido a favoritos' });
      } catch (error) {
       
          next(error);
      }
  }

  async removeFavorite(req, res, next) {
      try {
          const { productId } = req.params;
          if (!productId) return res.status(400).json({ success: false, message: 'ID de producto requerido' });
          
          await UserService.removeFavorite(req.user.id, productId);
          res.status(200).json({ success: true, message: 'Eliminado de favoritos' });
      } catch (error) {
          next(error);
      }
  }

  async getPointsHistory(req, res, next) {
      try {
          const user = await UserService.getProfile(req.user.id);
          const history = user.pointsHistory || [];
          
          const earned = history
            .filter(h => h.type === 'EARNED')
            .reduce((sum, h) => sum + Number(h.amount), 0);
            
          const used = history
            .filter(h => h.type === 'USED')
            .reduce((sum, h) => sum + Number(h.amount), 0);

          res.status(200).json({ 
              success: true, 
              data: {
                  balance: user.points || 0,
                  earned,
                  used,
                  history
              } 
          });
      } catch (error) {
          next(error);
      }
  }
}

module.exports = new UserController();
