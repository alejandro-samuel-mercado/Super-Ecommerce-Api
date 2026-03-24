const prisma = require('../config/prisma');
const AuditService = require('./audit.service');

class ExpenseService {
    async create(data, adminId, ip) {
        const expenseDate = data.expenseDate ? new Date(data.expenseDate) : new Date();
        
        // Determinar amountInBase
        let amountInBase = null;
        if (data.currencyCode && data.amount) {
            const config = await prisma.storeConfig.findFirst({where: {id: 1}});
            if (config.baseCurrency === data.currencyCode) {
                amountInBase = data.amount;
            } else {
                const currency = await prisma.currency.findUnique({where: {code: data.currencyCode}});
                if (currency) {
                    amountInBase = data.amount * Number(currency.exchangeRateToBase);
                }
            }
        }

        const expense = await prisma.expense.create({
            data: {
                branchId: data.branchId ? Number(data.branchId) : null,
                adminId: Number(adminId),
                amount: Number(data.amount),
                currencyCode: data.currencyCode || 'ARS',
                amountInBase: amountInBase,
                category: data.category,
                notes: data.notes || null,
                expenseDate: expenseDate,
                isActive: true
            }
        });

        await AuditService.logAction({
            adminId,
            action: 'CREATE_EXPENSE',
            entityType: 'EXPENSE',
            entityId: expense.id,
            branchId: data.branchId || null,
            changes: { new: expense },
            ip
        });

        return expense;
    }

    async findAll(filters = {}) {
        const { branchId, startDate, endDate, category } = filters;
        let where = { isActive: true };

        if (branchId) where.branchId = Number(branchId);
        if (category) where.category = category;
        if (startDate || endDate) {
            where.expenseDate = {};
            if (startDate) where.expenseDate.gte = new Date(startDate);
            if (endDate) where.expenseDate.lte = new Date(endDate);
        }

        const expenses = await prisma.expense.findMany({
            where,
            include: {
                admin: { select: { id: true, name: true, email: true } },
                branch: { select: { id: true, name: true } }
            },
            orderBy: { expenseDate: 'desc' },
        });

        // Sumatorias
        const totalAmount = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
        const totalAmountBase = expenses.reduce((sum, exp) => sum + Number(exp.amountInBase || exp.amount), 0);

        return {
            data: expenses,
            summary: {
                totalAmount,
                totalAmountBase,
                count: expenses.length
            }
        };
    }

    async getById(id) {
        return await prisma.expense.findUnique({
            where: { id: Number(id) },
            include: {
                admin: { select: { id: true, name: true, email: true } },
                branch: { select: { id: true, name: true } }
            }
        });
    }

    async delete(id, adminId, ip) {
        const expense = await prisma.expense.findUnique({ where: { id: Number(id) } });
        if (!expense) throw new Error('Gasto no encontrado');

        const deleted = await prisma.expense.update({
            where: { id: Number(id) },
            data: { isActive: false }
        });

        await AuditService.logAction({
            adminId,
            action: 'DELETE_EXPENSE',
            entityType: 'EXPENSE',
            entityId: id,
            branchId: expense.branchId,
            changes: { status: 'DELETED' },
            ip
        });

        return deleted;
    }
}

module.exports = new ExpenseService();
