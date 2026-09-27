import express from 'express';
import { 
  getTransactions, 
  createTransaction, 
  updateTransaction, 
  deleteTransaction, 
  getSummary,
  getBankSavings,
  transferBankSavings,
  processMonthEndSavings,
  updateBankSavings
} from '../controllers/transactionController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/summary', getSummary);
router.get('/bank-savings', getBankSavings);
router.post('/bank-savings/transfer', transferBankSavings);
router.post('/bank-savings/month-end', processMonthEndSavings);
router.put('/bank-savings', updateBankSavings);

router.get('/', getTransactions);
router.post('/', createTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
