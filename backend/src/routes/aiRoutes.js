import express from 'express';
import { parseTransaction, parseAndExecute, chatWithAI, getSuggestions } from '../controllers/aiController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/parse-transaction', parseTransaction);
router.post('/parse', parseTransaction);
router.post('/execute', parseAndExecute);
router.post('/chat', chatWithAI);
router.get('/suggestions', getSuggestions);

export default router;
