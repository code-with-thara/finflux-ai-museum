import express from 'express';
import { register, login, getMe, completeOnboarding, updateSettings } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, getMe);
router.put('/onboarding', authenticateToken, completeOnboarding);
router.post('/onboarding', authenticateToken, completeOnboarding);
router.put('/settings', authenticateToken, updateSettings);

export default router;
