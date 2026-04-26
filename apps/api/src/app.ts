import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { authRouter } from './modules/auth/auth.router.js';
import { agentRouter } from './modules/agent/agent.router.js';
import { callRouter } from './modules/call/call.router.js';
import { knowledgeBaseRouter } from './modules/knowledge-base/kb.router.js';
import { organizationRouter } from './modules/organization/org.router.js';
import { contactRouter } from './modules/contact/contact.router.js';
import { analyticsRouter } from './modules/analytics/analytics.router.js';
import { queueRouter } from './modules/queue/queue.router.js';
import { phoneNumberRouter } from './modules/phone-number/phone-number.router.js';
import { sseRouter } from './realtime/sse.router.js';
import { errorHandler } from './common/middleware/error-handler.js';

export function createApp() {
  const app = express();

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    }),
  );
  app.use(compression());
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Better Auth must be mounted BEFORE express.json() — it reads the raw body.
  app.use('/api/auth', authRouter);

  app.use(express.json());
  app.use('/api', apiLimiter);

  app.use('/api/organizations', organizationRouter);
  app.use('/api/agents', agentRouter);
  app.use('/api/calls', callRouter);
  app.use('/api/knowledge-base', knowledgeBaseRouter);
  app.use('/api/contacts', contactRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/queue', queueRouter);
  app.use('/api/phone-numbers', phoneNumberRouter);
  app.use('/api/events', sseRouter);

  app.use(errorHandler);

  return app;
}
