import express from 'express';
import { getGoals, createGoal, depositToGoal, withdrawFromGoal, deleteGoal } from '../controllers/goalController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getGoals);
router.post('/', createGoal);
router.post('/:id/deposit', depositToGoal);
router.post('/:id/withdraw', withdrawFromGoal);
router.delete('/:id', deleteGoal);

export default router;
