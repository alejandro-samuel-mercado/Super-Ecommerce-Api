const PDFDocument = require('pdfkit');

class StockTransferPdfGenerator {
    /**
     * Generates a professional PDF for a stock transfer.
     * @param {Object} transfer - The transfer object with items, originBranch, and destinationBranch.
     * @param {Object} storeConfig - Store configuration for logo and company name.
     * @returns {Promise<Buffer>} - The generated PDF as a buffer.
     */
    async generate(transfer, storeConfig = {}) {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // --- Header ---
            const logoUrl = storeConfig.logoUrl;
            if (logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('https'))) {
                // In a real environment, we might want to fetch the image and use it
                // For now, we'll just put the company name if we can't easily fetch it
                doc.fontSize(20).text(storeConfig.storeName || 'SUPER X E-COMMERCE', { align: 'right' });
            } else {
                doc.fontSize(20).text(storeConfig.storeName || 'SUPER X E-COMMERCE', { align: 'right' });
            }

            doc.fontSize(10).text(`Fecha: ${new Date(transfer.createdAt).toLocaleDateString()}`, { align: 'right' });
            doc.text(`Transferencia ID: #${transfer.id}`, { align: 'right' });
            doc.moveDown();

            doc.fontSize(18).text('COMPROBANTE DE TRANSFERENCIA DE STOCK', { align: 'center', underline: true });
            doc.moveDown(2);

            // --- Info Sections ---
            const startY = doc.y;
            doc.fontSize(12).font('Helvetica-Bold').text('ORIGEN:', 50, startY);
            doc.font('Helvetica').text(`${transfer.originBranch.name}`, 50, doc.y);
            doc.text(`${transfer.originBranch.address}, ${transfer.originBranch.city}`, 50, doc.y);
            doc.text(`Tel: ${transfer.originBranch.phone}`, 50, doc.y);

            doc.font('Helvetica-Bold').text('DESTINO:', 300, startY);
            doc.font('Helvetica').text(`${transfer.destinationBranch.name}`, 300, doc.y);
            doc.text(`${transfer.destinationBranch.address}, ${transfer.destinationBranch.city}`, 300, doc.y);
            doc.text(`Tel: ${transfer.destinationBranch.phone}`, 300, doc.y);

            doc.moveDown(2);

            // --- Responsible User ---
            doc.fontSize(10).font('Helvetica-Bold').text('Solicitado por: ', { continued: true });
            doc.font('Helvetica').text(transfer.user?.name || 'Sistema');
            if (transfer.notes) {
                doc.font('Helvetica-Bold').text('Observaciones: ', { continued: true });
                doc.font('Helvetica').text(transfer.notes);
            }
            doc.moveDown();

            // --- Items Table ---
            const tableTop = doc.y + 10;
            doc.font('Helvetica-Bold');
            doc.text('Cod. SKU', 50, tableTop);
            doc.text('Producto', 150, tableTop);
            doc.text('Cantidad', 450, tableTop, { align: 'right', width: 100 });

            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            let itemY = tableTop + 25;
            doc.font('Helvetica');

            transfer.items.forEach(item => {
                const productName = item.sku?.product?.name || 'Producto desconocido';
                const skuCode = item.sku?.code || item.skuId;
                
                doc.text(skuCode, 50, itemY);
                doc.text(productName, 150, itemY, { width: 280 });
                doc.text(item.quantity.toString(), 450, itemY, { align: 'right', width: 100 });
                
                itemY += 20;
                
                // Check if we need a new page
                if (itemY > 700) {
                    doc.addPage();
                    itemY = 50;
                }
            });

            doc.moveTo(50, itemY).lineTo(550, itemY).stroke();
            doc.moveDown(4);

            // --- Signatures ---
            const footerY = doc.page.height - 150;
            
            doc.moveTo(50, footerY).lineTo(200, footerY).stroke();
            doc.text('Firma Remitente', 50, footerY + 5, { width: 150, align: 'center' });
            doc.text('(Despacho)', 50, footerY + 20, { width: 150, align: 'center' });

            doc.moveTo(350, footerY).lineTo(500, footerY).stroke();
            doc.text('Firma Receptor', 350, footerY + 5, { width: 150, align: 'center' });
            doc.text('(Recepción)', 350, footerY + 20, { width: 150, align: 'center' });

            // --- Footer ---
            doc.fontSize(8).text('Este documento es un comprobante interno de movimiento de stock.', 50, doc.page.height - 50, { align: 'center' });

            doc.end();
        });
    }
}

module.exports = new StockTransferPdfGenerator();
