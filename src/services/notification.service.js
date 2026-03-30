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

      console.log(`[NotificationService] Sending email to: ${to} | Subject: ${subject}`);
      
      const info = await this.transporter.sendMail({
        from: `"${storeName}" <${fromEmail}>`,
        to,
        subject,
        html: htmlContent,
        attachments
      });

      // La URL de vista previa solo está disponible cuando se envía a través de Ethereal
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) console.log(`[NotificationService] Preview URL: ${previewUrl}`);
      
      return info;
    } catch (error) {
      console.error('[NotificationService] Error sending email:', error.message);
      return null;
    }
  }

  getWelcomeTemplate(name) {
      return `<h1>¡Bienvenido/a, ${name}!</h1><p>Gracias por registrarte en nuestra plataforma.</p>`;
  }

  async getOrderConfirmationTemplate(orderId, total, paymentType = 'MERCADO_PAGO', uuid = null) {
      const config = await prisma.storeConfig.findFirst({ where: { id: 1 } });
      const whatsapp = config?.whatsapp || '';
      const supportEmail = config?.supportEmail || '';
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      let instructions = '';
      if (paymentType === 'MERCADO_PAGO' || paymentType === 'TRANSFER' || paymentType === 'QR') {
          instructions = `
            <div style="margin-top: 20px; padding: 15px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d;">
                <p style="margin: 0; font-weight: bold; color: #92400e;">  Instrucciones de Pago:</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #b45309;">
                    Si elegiste Pago Fácil, Rapipago, QR o Transferencia, recuerda que debes enviar el comprobante de pago para que procesemos tu envío.
                    <br><br>
                    <strong>WhatsApp:</strong> ${whatsapp}<br>
                    <strong>Email:</strong> ${supportEmail}
                </p>
            </div>
          `;
      }

      const orderUrl = uuid ? `${baseUrl}/checkout/pending?saleId=${uuid}` : `${baseUrl}/checkout/pending?saleId=${orderId}`;

      return `
        <div style="font-family: sans-serif; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">¡Pedido Recibido!</h1>
            </div>
            <div style="padding: 24px;">
                <p>Hola,</p>
                <p>Tu pedido <strong>#${orderId}</strong> por el monto de <strong>$${total}</strong> ha sido creado exitosamente.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${orderUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Detalle del Pedido</a>
                </div>

                ${instructions}
                
                <p style="margin-top: 20px;">Una vez acreditado el pago, procesaremos tu envío a la brevedad.</p>
                <p>¡Gracias por confiar en nosotros!</p>
            </div>
            <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
                Este es un correo automático, por favor no lo respondas.
            </div>
        </div>
      `;
  }
}

module.exports = new NotificationService();
