const prisma = require("../config/prisma");

class SaleQueryService {
    async getSaleById(id, userId, role) {
        const saleId = parseInt(id);
        if (isNaN(saleId))
            throw new Error("Venta ID inválido (debe ser un número).");

        const sale = await prisma.sale.findUnique({
            where: { id: saleId },
            include: {
                items: true,
                coupon: true,
                currency: true,
                branch: true,
                receipt: true,
                user: {
                    select: {
                        name: true,
                        email: true,
                        dni: true,
                        phone: true,
                        country: true,
                        state: true,
                        city: true,
                        address: true,
                    },
                },
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        country: true,
                        state: true,
                        city: true,
                        address: true,
                    },
                },
            },
        });
        if (!sale) throw new Error("La venta solicitada no existe.");
        const roleName = typeof role === "string" ? role : role?.name;
        if (roleName === "CUSTOMER" && sale.userId !== userId)
            throw new Error("No tienes permisos para visualizar esta orden.");

        return sale;
    }

    async getSaleByUuid(uuid) {
        if (!uuid || typeof uuid !== 'string')
            throw new Error("UUID de venta inválido.");

        const sale = await prisma.sale.findUnique({
            where: { uuid: uuid },
            include: {
                items: true,
                coupon: true,
                currency: true,
                branch: true,
                receipt: true,
                user: {
                    select: {
                        name: true,
                        email: true,
                        dni: true,
                        phone: true,
                        country: true,
                        state: true,
                        city: true,
                        address: true,
                    },
                },
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        country: true,
                        state: true,
                        city: true,
                        address: true,
                    },
                },
            },
        });
        if (!sale) throw new Error("La venta solicitada no existe o el enlace es inválido.");
        return sale;
    }

    async getAllSales(filters = {}) {
        const {
            branchId,
            branchIds,
            paymentStatus,
            isAbandoned,
            isPendingPayment,
            isCancelled,
            deliveryType,
            paymentType,
            deliveryStatus,
            search,
            employeeId,
            page = 1,
            limit = 20
        } = filters;

        const p = Math.max(1, parseInt(page));
        const l = Math.max(1, parseInt(limit));
        const skip = (p - 1) * l;

        const where = {};

        if (branchId) where.branchId = parseInt(branchId);
        else if (branchIds && branchIds.length > 0) where.branchId = { in: branchIds.map(id => parseInt(id)) };

        if (search) {
            const searchTrim = search.trim();
            if (!isNaN(parseInt(searchTrim))) {
                where.id = parseInt(searchTrim);
            } else {
                where.OR = [
                    { user: { name: { contains: searchTrim, mode: 'insensitive' } } },
                    { user: { email: { contains: searchTrim, mode: 'insensitive' } } }
                ];
            }
        }

        if (isAbandoned === 'true') {
            where.paymentStatus = 'PENDING';
            where.mpPaymentId = null;
            where.paymentType = { notIn: ['CASH', 'TRANSFER', 'QR'] };
        } else if (isPendingPayment === 'true') {
            where.paymentStatus = 'PENDING';
            where.OR = [
                { paymentType: { in: ['CASH', 'TRANSFER', 'QR'] } },
                { mpPaymentId: { not: null } }
            ];
        } else if (isCancelled === 'true') {
            where.paymentStatus = { in: ['CANCELLED', 'REJECTED'] };
        } else if (isAbandoned === 'false') {
            where.paymentStatus = 'PAID';
        } else if (paymentStatus) {
            where.paymentStatus = paymentStatus;
        }

        if (deliveryType) where.deliveryType = deliveryType;
        if (paymentType) where.paymentType = paymentType;
        if (deliveryStatus) where.deliveryStatus = deliveryStatus;
        if (employeeId) where.employeeId = parseInt(employeeId);

        const sales = await prisma.sale.findMany({
            where,
            include: {
                items: true,
                coupon: true,
                receipt: true,
                user: {
                    select: { id: true, name: true, email: true, phone: true, dni: true },
                },
                employee: { select: { id: true, name: true, email: true } },
                branch: { select: { name: true } }
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: l
        });

        const total = await prisma.sale.count({ where });

        return { data: sales, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
    }

    async getUserSales(userId, includePending = true) {
        const where = { userId: parseInt(userId) };

        if (!includePending) {
            where.paymentStatus = { notIn: ["PENDING", "CANCELLED", "REJECTED"] };
        }

        return await prisma.sale.findMany({
            where,
            include: { items: true, receipt: true },
            orderBy: { createdAt: "desc" },
        });
    }
}

module.exports = new SaleQueryService();
