import express from 'express';
import { getBudgets, setBudget, toggleBudget, deleteBudget } from '../controllers/budgetController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getBudgets);
router.post('/', setBudget);
router.post('/toggle', toggleBudget);
router.delete('/:id', deleteBudget);

export default router;
