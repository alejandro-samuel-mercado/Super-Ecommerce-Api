const PDFDocument = require('pdfkit');
const axios = require('axios');
const bwipjs = require('bwip-js');

class InvoiceService {
  /**
   * Genera un PDF profesional para una venta dada.
   * @param {Object} sale - Objeto de venta con items, user y coupon incluidos.
   * @param {Object} config - Configuración global de la tienda.
   * @returns {Promise<Buffer>}
   */
  async generateInvoicePDF(sale, config) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
            
            margin:50,
            size: 'A4',
            info: {
                Title: `Factura ${sale.uuid || sale.id}`,
                Author: config?.storeName || 'Official Store',
            }
        });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // --- CONFIGURACIÓN DE COLORES Y MARCA ---
        const brandPurple = '#8e407a';
        const brandCoral = '#fe6962';
        const darkGray = '#1f2937';
        const lightGray = '#f9fafb';
        const dividerColor = '#e5e7eb';

        // --- LÓGICA DE TIPO DE COMPROBANTE ---
        const ticketNum = sale.receipt?.ticketNumber || String(sale.id).padStart(8, '0');
        let typeLetter = 'X';
        let typeCode = '';
        let typeName = 'FACTURA';

        if (ticketNum.startsWith('A')) {
            typeLetter = 'A';
            typeCode = 'COD. 001';
            typeName = 'FACTURA';
        } else if (ticketNum.startsWith('B')) {
            typeLetter = 'B';
            typeCode = 'COD. 006';
            typeName = 'FACTURA';
        } else if (ticketNum.startsWith('C')) {
            typeLetter = 'C';
            typeCode = 'COD. 011';
            typeName = 'FACTURA';
        }

        // --- LOGO Y ENCABEZADO "SOCIAL PREMIUM" ---
        doc
            .rect(0, 0, 600, 120)
            .fill(brandPurple);

        // Logo
        let textX = 50;
        if (config?.showLogoOnInvoice && config?.logoUrl) {
            try {
                const response = await axios.get(config.logoUrl, { responseType: 'arraybuffer' });
                doc.image(response.data, 50, 30, { height: 60 });
                textX = 160; // Desplazar texto si hay logo
            } catch (error) {
                console.error('Error loading logo for invoice:', error.message);
            }
        }

        // Parsear nombre de la tienda
        const nameParts = (config?.storeName || 'OFFICIAL STORE').split(' ');
        const firstLine = nameParts.join(' ').toUpperCase();


        doc
            .fillColor('#FFFFFF')
            .fontSize(nameParts.length > 2 ? 15 : 20)
            .font('Helvetica-Bold')
            .text(firstLine, textX, 45)
 

        // Datos de la factura (Derecha)
        doc
            .fillColor('#FFFFFF')
            .fontSize(20)
            .font('Helvetica-Bold')
            .text(typeName, 350, 40, { align: 'right' })
            .fontSize(10)
            .font('Helvetica')
            .text(`NRO: ${ticketNum}`, 350, 65, { align: 'right' })
            .text(`FECHA: ${new Date(sale.createdAt).toLocaleDateString('es-AR')}`, 350, 80, { align: 'right' })
            .text(`ID: ${sale.uuid?.substring(0, 8).toUpperCase() || 'N/A'}`, 350, 95, { align: 'right' });

        // --- DATOS DEL EMISOR ---
        const emisorAddress = sale.branch?.address || config?.address || 'DIRECCIÓN NO CONFIGURADA';
        const emisorCity = sale.branch?.city || '';

        doc
            .fillColor(darkGray)
            .fontSize(9)
            .font('Helvetica-Bold')
            .text((config?.storeName || 'OFFICIAL STORE').toUpperCase(), 50, 165)
            .font('Helvetica')
            .text(`${emisorAddress.toUpperCase()}${emisorCity ? ', ' + emisorCity.toUpperCase() : ''}`, 50, 180)
            .text(`IVA RESPONSABLE INSCRIPTO`, 50, 195);
        
        // --- RNT / CUIT EMISOR (Opcional, si existiera en config, pero nos pidieron RNT en cliente) ---
        // Si el cliente tiene RNT lo mostraremos abajo.

        // --- DATOS DEL CLIENTE ---
        doc
            .rect(340, 160, 210, 100) // Aumentado para RNT
            .fill(lightGray);

        doc
            .fillColor(brandPurple)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('CLIENTE', 350, 170)
            .fillColor(darkGray)
            .font('Helvetica')
            .fontSize(9)
            .text(`NOMBRE: ${sale.user?.name || sale.customerName || 'CONSUMIDOR FINAL'}`, 350, 185, { width: 190 })
            .text(`EMAIL: ${sale.user?.email || sale.customerEmail || 'N/A'}`, 350, 200, { width: 190 })
            .text(`DNI/CUIT: ${sale.user?.dni || sale.customerDni || 'N/A'}`, 350, 215);
        
        if (sale.user?.rnt) {
            doc.text(`RNT: ${sale.user.rnt}`, 350, 230);
        }

        doc
            .text(`TELEFONO: ${sale.user?.phone || sale.customerPhone || 'N/A'}`, 350, sale.user?.rnt ? 245 : 230)
            .text(`DIRECCIÓN: ${sale.user?.address || sale.customerAddress || 'N/A'}`, 350, sale.user?.rnt ? 260 : 245, { width: 190 });

        doc.moveDown(4);

        // --- TABLA DE ITEMS ---
        const tableTop = 340;
        const itemX = 50;
        const qtyX = 300;
        const priceX = 355;
        const totalX = 450;

        // Header de Tabla (Bloque sólido)
        doc
            .rect(50, tableTop, 500, 25)
            .fill(darkGray);
        
        doc
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(9)
            .text('DESCRIPCIÓN', itemX + 10, tableTop + 8)
            .text('CANT', qtyX, tableTop + 8)
            .text('PRECIO U.', priceX, tableTop + 8, { width: 80, align: 'right' })
            .text('SUBTOTAL', totalX, tableTop + 8, { width: 85, align: 'right' });

        let y = tableTop + 35;
        doc.font('Helvetica').fontSize(9);

        const currencySymbols = { 'ARS': '$', 'USD': 'USD ', 'UYU': '$U ', 'EUR': '€' };
        const symbol = sale.currency?.symbol || currencySymbols[sale.currencyCode] || '$';
        const localeMap = { 'ARS': 'es-AR', 'UYU': 'es-UY', 'USD': 'en-US', 'EUR': 'en-US' };
        const numLocale = localeMap[sale.currencyCode] || 'es-AR';

        sale.items.forEach((item, index) => {
            const itemHeight = doc.heightOfString(item.productName.toUpperCase(), { width: 230 }) + 10;
            const minHeight = 25;
            const rowHeight = Math.max(itemHeight, minHeight);

            if (y + rowHeight > 750) {
                doc.addPage();
                y = 50;
            }

            doc
                .fillColor(darkGray)
                .text(item.productName.toUpperCase(), itemX + 10, y + 5, { width: 230 })
                .text(Number(item.quantity).toString(), qtyX, y + 5)
                .text(`${symbol}${parseFloat(item.unitPrice).toLocaleString(numLocale)}`, priceX, y + 5, { width: 80, align: 'right' })
                .text(`${symbol}${parseFloat(item.subtotal).toLocaleString(numLocale)}`, totalX, y + 5, { width: 85, align: 'right' });
            
            doc
                .moveTo(50, y + rowHeight)
                .lineTo(550, y + rowHeight)
                .strokeColor(dividerColor)
                .lineWidth(0.5)
                .stroke();
                
            y += rowHeight;
        });

        // --- RESUMEN DE TOTALES ---
        y += 20;
        const sumX = 350;
        const sumValX = 450;

        if (y > 650) {
            doc.addPage();
            y = 50;
        }

        doc.fontSize(10).fillColor(darkGray);
        
        // Subtotal
        doc.font('Helvetica-Bold').text('SUBTOTAL NETO:', sumX, y);
        doc.font('Helvetica').text(`${symbol}${parseFloat(sale.subtotal).toLocaleString(numLocale)}`, sumValX, y, { width: 85, align: 'right' });
        y += 18;

        // IVA
        const taxRate = config?.taxRate ? Number(config.taxRate) : 21;
        const taxVal = parseFloat(sale.taxAmount || sale.tax || 0);
        const taxLabel = taxVal > 0 ? `IVA (${taxRate}%):` : `IVA (0% - EXENTO):`;
        doc.font('Helvetica-Bold').text(taxLabel, sumX, y);
        doc.font('Helvetica').text(`${symbol}${taxVal.toLocaleString(numLocale)}`, sumValX, y, { width: 85, align: 'right' });
        y += 18;

        // Envío
        const shippingVal = parseFloat(sale.shippingCost || sale.shipping || 0);
        if (shippingVal > 0) {
            doc.font('Helvetica-Bold').text('COSTO ENVÍO:', sumX, y);
            doc.font('Helvetica').text(`${symbol}${shippingVal.toLocaleString(numLocale)}`, sumValX, y, { width: 85, align: 'right' });
            y += 18;
        }

        // Descuentos
        if (parseFloat(sale.discount) > 0) {
            doc.fillColor(brandCoral).font('Helvetica-Bold').text('DESCUENTOS:', sumX, y);
            doc.text(`-${symbol}${parseFloat(sale.discount).toLocaleString(numLocale)}`, sumValX, y, { width: 85, align: 'right' });
            y += 18;
        }

        const ptsDiscount = parseFloat(sale.pointsDiscount || 0);
        if (ptsDiscount > 0) {
            doc.fillColor(brandCoral).font('Helvetica-Bold').text('DESC. PUNTOS:', sumX, y);
            doc.text(`-${symbol}${ptsDiscount.toLocaleString(numLocale)}`, sumValX, y, { width: 85, align: 'right' });
            y += 18;
        }

        // TOTAL FINAL
        y += 10;
        doc
            .rect(sumX - 10, y - 5, 210, 45)
            .fill(brandCoral);
        
        const totalStr = `${symbol}${parseFloat(sale.total).toLocaleString(numLocale)}`;
        const totalFontSize = totalStr.length > 12 ? 14 : 18;

        doc
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(14)
            .text('TOTAL', sumX, y + 15)
            .fontSize(totalFontSize)
            .text(totalStr, sumValX - 25, y + (totalStr.length > 12 ? 17 : 12), { width: 110, align: 'right' });

        // --- PIE DE PÁGINA ---
        doc
            .fillColor('#9CA3AF')
            .fontSize(7)
            .font('Helvetica')
            .text('ESTE DOCUMENTO ES UNA CONSTANCIA DE COMPRA ELECTRÓNICA. NO VÁLIDO COMO FACTURA FISCAL AFIP.', 50, 780, { align: 'center', characterSpacing: 1 });
        
        doc
            .rect(50, 795, 500, 10)
            .fill(brandPurple);
        
        doc
            .fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .text((config?.ticketFooter || `GRACIAS POR ELEGIR ${(config?.storeName || 'OFFICIAL STORE')}`).toUpperCase(), 50, 796, { align: 'center', characterSpacing: 2 });

        // --- CÓDIGO QR ---
        try {
            const qrData = JSON.stringify({
                t: ticketNum,
                s: config?.storeName || 'Official Store',
                d: new Date(sale.createdAt).toISOString().split('T')[0],
                v: parseFloat(sale.total)
            });

            // Promesa con timeout para evitar cuelgues
            const generateQR = () => new Promise(async (res, rej) => {
                const timeout = setTimeout(() => rej(new Error('QR Timeout')), 3000);
                try {
                    const buffer = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: qrData,
                        scale: 2
                    });
                    clearTimeout(timeout);
                    res(buffer);
                } catch (e) {
                    clearTimeout(timeout);
                    rej(e);
                }
            });

            const qrBuffer = await generateQR();

            // Posicionar QR a la izquierda del disclaimer legal
            doc.image(qrBuffer, 50, 720, { width: 45 });
            
            doc
                .fillColor(darkGray)
                .fontSize(7)
                .font('Helvetica-Bold')
                .text('ESCANEE PARA VALIDAR COMPROBANTE', 105, 740);

        } catch (qrError) {
            console.error('Error generating QR for invoice:', qrError.message);
        }

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new InvoiceService();
