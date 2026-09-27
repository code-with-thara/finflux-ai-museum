import express from 'express';
import { getBills, createBill, updateBill, markAsPaid, deleteBill } from '../controllers/billController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getBills);
router.post('/', createBill);
router.put('/:id', updateBill);
router.post('/:id/pay', markAsPaid);
router.delete('/:id', deleteBill);

export default router;
