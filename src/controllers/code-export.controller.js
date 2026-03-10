const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const prisma = require('../config/prisma');

const generateCodesPDF = async (req, res) => {
    try {
        const { type = 'QR', selectAll = false, selectedIds = [], filters = {} } = req.body;
        
        let targetProducts = [];

        // Recuperar productos a exportar iterando la lógica de filtros
        if (selectAll) {
            const whereClause = { isActive: true };
            if (filters.search) {
                whereClause.name = { contains: filters.search, mode: 'insensitive' };
            }
            if (filters.categoryId) {
                whereClause.categoryId = parseInt(filters.categoryId);
            }
            
            const activeBranchId = req.branchId;
            if (activeBranchId) {
                whereClause.branchInventory = {
                    some: { branchId: activeBranchId, stock: { gt: 0 } }
                }
            }
           
            targetProducts = await prisma.product.findMany({
                where: whereClause,
                take: 1500, 
                select: { 
                    id: true, 
                    name: true, 
                    qr: true,
                    skus: {
                        take: 1,
                        select: { code: true, barcode: true }
                    }
                }
            });
        } else {
            if (!selectedIds.length) return res.status(400).json({ error: 'Níngun producto seleccionado.' });
            targetProducts = await prisma.product.findMany({
                where: { id: { in: selectedIds } },
                select: { 
                    id: true, 
                    name: true, 
                    qr: true,
                    skus: {
                        take: 1,
                        select: { code: true, barcode: true }
                    }
                }
            });
        }

        if (targetProducts.length === 0) {
            return res.status(404).json({ error: 'No se encontraron productos para exportar con ese criterio.' });
        }

        // Preparar Stream PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=codigos_${type}_${new Date().getTime()}.pdf`);
        doc.pipe(res);

        const isQR = type === 'QR';
        
        // Settings del GRID 3x7 para etiquetas (21 por página)
        const cols = 3;
        const rows = 7;
        const startX = 40;
        const startY = 40;
        const cellWidth = 170;
        const cellHeight = 110;
        const maxPerPage = cols * rows;

        let index = 0;

        for (const prod of targetProducts) {
            const x = startX + (index % cols) * cellWidth;
            const y = startY + Math.floor((index % maxPerPage) / cols) * cellHeight;

            // Header 
            const displayName = prod.name.length > 25 ? prod.name.substring(0, 22) + '...' : prod.name;
            doc.fontSize(9).text(displayName, x, y, { width: cellWidth - 10, align: 'center' });

            const sku = prod.skus?.[0];
            const codeString = isQR 
                ? (prod.qr || sku?.barcode || sku?.code || `PROD-${prod.id}`) 
                : (sku?.barcode || sku?.code || `PROD-${prod.id}`);

            try {
                // Generar Buffer del Código vía BWIP-JS Promise
                const pngBuffer = await bwipjs.toBuffer({
                    bcid: isQR ? 'qrcode' : 'code128',
                    text: codeString,
                    scale: 3,
                    height: isQR ? 15 : 10,
                    includetext: !isQR,
                    textxalign: 'center',
                });

                const imgYOffset = isQR ? 15 : 20;
                doc.image(pngBuffer, x + (isQR ? (cellWidth-60)/2 : 10), y + imgYOffset, { 
                    width: isQR ? 60 : cellWidth - 30 
                });

            } catch (bwipError) {
                console.error('Error BWIP en ID', prod.id, bwipError);
                doc.fontSize(8).fillColor('red').text('Error Generando', x, y+20);
                doc.fillColor('black');
            }

            index++;
            
            // Añadir nueva página si el grid está lleno (y no es el último)
            if (index % maxPerPage === 0 && index < targetProducts.length) {
                doc.addPage();
            }
        }

        // Finalizar el PDF Stream
        doc.end();

    } catch (error) {
        console.error('[ExportController] Error gen', error);
        
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error general al generar PDF de Códigos.' });
        }
    }
};

module.exports = {
    generateCodesPDF
};
