const nodemailer = require('nodemailer');
const prisma = require('../config/prisma');

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
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const storeName = config?.storeName || 'Tienda Online';
      const fromEmail = process.env.SMTP_USER || 'no-reply@ecommerce.com';

      const info = await this.transporter.sendMail({
        from: `"${storeName}" <${fromEmail}>`,
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

  getWelcomeTemplate(name) {
      return `<h1>¡Bienvenido/a, ${name}!</h1><p>Gracias por registrarte en nuestra plataforma.</p>`;
  }

  async getOrderConfirmationTemplate(orderId, total, paymentType = 'MERCADO_PAGO') {
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const whatsapp = config?.whatsapp || '';
      const supportEmail = config?.supportEmail || '';

      let instructions = '';
      if (paymentType === 'MERCADO_PAGO' || paymentType === 'TRANSFER') {
          instructions = `
            <div style="margin-top: 20px; padding: 15px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d;">
                <p style="margin: 0; font-weight: bold; color: #92400e;">  Instrucciones de Pago:</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #b45309;">
                    Si elegiste Pago Fácil, Rapipago o Transferencia, recuerda que debes enviar el comprobante de pago para que procesemos tu envío.
                    <br><br>
                    <strong>WhatsApp:</strong> ${whatsapp}<br>
                    <strong>Email:</strong> ${supportEmail}
                </p>
            </div>
          `;
      }

      return `
        <div style="font-family: sans-serif; color: #374151;">
            <h1>¡Pedido Recibido!</h1>
            <p>Tu pedido <strong>#${orderId}</strong> por el monto de <strong>$${total}</strong> ha sido creado.</p>
            ${instructions}
            <p style="margin-top: 20px;">Una vez acreditado el pago, procesaremos tu envío a la brevedad.</p>
        </div>
      `;
  }
}

module.exports = new NotificationService();
