const nodemailer = require('nodemailer');

class NotificationService {
  constructor() {
    this.transporter = null;
    this.init();
  }

  async init() {
    // Si hay credenciales reales, usar SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
   
      try {
          const testAccount = await nodemailer.createTestAccount();
          this.transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
              user: testAccount.user,
              pass: testAccount.pass,
            },
          });
      } catch (err) {
          console.error('📧 NotificationService Error: Could not create Ethereal account', err);
      }
    }
  }

  /**
   * Envía un correo electrónico.
   * @param {string} to - Destinatario
   * @param {string} subject - Asunto
   * @param {string} htmlContent - Contenido HTML
   * @param {Array} attachments - Opcional: Archivos adjuntos
   */
  async sendEmail(to, subject, htmlContent, attachments = []) {
    if (!this.transporter) await this.init();

    try {
      const info = await this.transporter.sendMail({
        from: '"Tienda Online" <no-reply@ecommerce.com>',
        to,
        subject,
        html: htmlContent,
        attachments
      });

      // La URL de vista previa solo está disponible cuando se envía a través de Ethereal
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
          console.log('📧 Email enviado (Simulado):', previewUrl);
      }
      return info;
    } catch (error) {
      console.error('📧 Error sending email:', error);
   
      return null;
    }
  }

  // Templates simples
  getWelcomeTemplate(name) {
      return `<h1>¡Bienvenido/a, ${name}!</h1><p>Gracias por registrarte en nuestra plataforma.</p>`;
  }

  getOrderConfirmationTemplate(orderId, total) {
      return `<h1>¡Pedido Recibido!</h1><p>Tu pedido #${orderId} por el monto de $${total} ha sido creado. Realiza el pago para procesar el envío.</p>`;
  }
}

module.exports = new NotificationService();
