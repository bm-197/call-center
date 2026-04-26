import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';

const router = Router();

// Better Auth handles all /api/auth/* routes (sign-in, sign-up, sessions,
// organization plugin endpoints, etc.). Must be mounted BEFORE express.json()
// so it can read the raw body.
router.all('/*splat', toNodeHandler(auth));

export { router as authRouter };
