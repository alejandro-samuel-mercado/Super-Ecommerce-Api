const AuthService = require('../services/auth.service');
const passport = require('passport');

class AuthController {

  async register(req, res, next) {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json({ success: true, message: 'Usuario registrado exitosamente', data: result });
    } catch (error) {
       if (error.message.includes('Email already')) {
           return res.status(409).json({ success: false, message: error.message });
       }
       next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.status(200).json({ success: true, message: 'Inicio de sesión exitoso', data: result });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
      try {
          const result = await AuthService.getProfile(req.user.id);
          res.status(200).json({ success: true, data: result });
      } catch (error) {
          next(error);
      }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh Token requerido' });
      
      const tokens = await AuthService.refreshToken(refreshToken);
      res.status(200).json({ success: true, data: tokens });
    } catch (error) {
      return res.status(401).json({ success: false, message: error.message });
    }
  }

  async logout(req, res) {
      
      res.status(200).json({ success: true, message: 'Sesión cerrada' });
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { email, code, newPassword } = req.body;
      const result = await AuthService.resetPassword(email, code, newPassword);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  googleLogin(req, res, next) {
    
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  }

  async googleCallback(req, res, next) {
    console.log('[Auth] Google callback triggered');
    passport.authenticate('google', { session: false }, async (err, user, info) => {
      if (err || !user) {
        console.error('[Auth] Google auth failed:', err || 'No user found');
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);
      }

      console.log('[Auth] Google auth success for:', user.email);

      try {
        const result = await AuthService.loginWithGoogle({
            email: user.email,
            name: user.name
        });

        console.log('[Auth] App login success for:', result.user.email);
        console.log('[Auth] Sending success response to popup');

        const { accessToken, refreshToken } = result.tokens;
        const authData = JSON.stringify({
          type: 'GOOGLE_AUTH_SUCCESS',
          user: result.user,
          accessToken,
          refreshToken
        });

        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
        );
        res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

        res.set('Content-Type', 'text/html');
        res.send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Autenticando...</title>
              <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; color: #1f2937; }
                  .card { background: white; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; width: 90%; }
                  .loader { border: 4px solid #f3f3f3; border-top: 4px solid #4f46e5; border-radius: 50%; width: 48px; height: 48px; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                  h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
                  p { color: #6b7280; margin-bottom: 1.5rem; }
                  .btn { background-color: #4f46e5; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s; width: 100%; }
                  .btn:hover { background-color: #4338ca; }
                  .error { color: #dc2626; background: #fee2e2; padding: 0.75rem; border-radius: 0.5rem; margin-top: 1rem; font-size: 0.875rem; display: none; }
                  .debug { margin-top: 1.5rem; font-size: 0.75rem; color: #9ca3af; text-align: left; background: #f9fafb; padding: 0.5rem; border-radius: 0.25rem; border: 1px solid #e5e7eb; }
              </style>
          </head>
          <body>
              <div class="card">
                  <div id="loader" class="loader"></div>
                  <h1 id="title">Sincronizando...</h1>
                  <p id="message">Estamos conectando con la aplicación principal.</p>
                  <button id="actionBtn" class="btn" style="display: none;">Completar manualmente</button>
                  <div id="errorBox" class="error"></div>
                  <div id="debugBox" class="debug">
                    <strong>Debug:</strong>
                    <div id="diag-opener">Comprobando ventana principal...</div>
                  </div>
              </div>

              <script>
                  (function() {
                      const title = document.getElementById('title');
                      const message = document.getElementById('message');
                      const btn = document.getElementById('actionBtn');
                      const loader = document.getElementById('loader');
                      const errorBox = document.getElementById('errorBox');
                      const diagOpener = document.getElementById('diag-opener');
                      const data = ${authData};

                      function updateDebug() {
                          const hasOpener = !!window.opener;
                          diagOpener.innerText = 'Has Opener: ' + hasOpener;
                          if (hasOpener) {
                              try {
                                  diagOpener.innerText += ' (' + window.opener.location.origin + ')';
                              } catch(e) {
                                  diagOpener.innerText += ' (Cross-Origin Access Restricted)';
                              }
                          }
                      }

                      function showError(msg) {
                          errorBox.innerText = msg;
                          errorBox.style.display = 'block';
                          loader.style.display = 'none';
                          btn.style.display = 'block';
                          updateDebug();
                      }

                      function attemptSync() {
                          updateDebug();
                          try {
                              if (window.opener) {
                                  console.log('[Auth] Opener found, sending postMessage');
                                  window.opener.postMessage(data, '*');
                                  
                                  title.innerText = '¡Todo listo!';
                                  message.innerText = 'La autenticación fue exitosa y enviada.';
                                  loader.style.display = 'none';
                                  
                                  setTimeout(() => {
                                      window.close();
                                  }, 2000);
                              } else {
                                  showError('No se encontró la ventana principal (window.opener es null).');
                              }
                          } catch (e) {
                              console.error('[Auth] Sync error:', e);
                              showError('Error al sincronizar: ' + e.message);
                          }
                      }

                      setTimeout(() => {
                          btn.style.display = 'block';
                          btn.innerText = 'Forzar cierre de sesión';
                      }, 5000);

                      btn.onclick = function() {
                          attemptSync();
                          setTimeout(() => window.close(), 1000);
                      };

                      window.onload = function() {
                          updateDebug();
                          setTimeout(attemptSync, 500);
                      };
                      
                      window.onerror = function(msg) {
                          showError('Excepción: ' + msg);
                      };
                  })();
              </script>
          </body>
          </html>
        `);
      } catch (error) {
        console.error('[Auth] Google sync error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=sync_failed`);
      }
    })(req, res, next);
  }
}

module.exports = new AuthController();
