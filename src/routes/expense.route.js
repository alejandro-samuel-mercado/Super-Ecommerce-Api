const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/expense.controller');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const { body } = require('express-validator');

const createValidators = [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('category').notEmpty().withMessage('Category is required'),
    body('expenseDate').optional().isISO8601()
];

// All routes are protected and restricted to SUPER_ADMIN and ADMIN
router.use(protect);
router.use(restrictTo(['SUPER_ADMIN', 'ADMIN']));

router.get('/', ExpenseController.findAll);
router.get('/:id', ExpenseController.getById);
router.post('/', createValidators, ExpenseController.create);
router.delete('/:id', ExpenseController.delete);

module.exports = router;
