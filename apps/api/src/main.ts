import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth/auth.router.js";
import { agentRouter } from "./modules/agent/agent.router.js";
import { callRouter } from "./modules/call/call.router.js";
import { knowledgeBaseRouter } from "./modules/knowledge-base/kb.router.js";
import { organizationRouter } from "./modules/organization/org.router.js";
import { contactRouter } from "./modules/contact/contact.router.js";
import { analyticsRouter } from "./modules/analytics/analytics.router.js";
import { queueRouter } from "./modules/queue/queue.router.js";
import { sseRouter } from "./realtime/sse.router.js";
import { errorHandler } from "./common/middleware/error-handler.js";

const app = express();
const PORT = process.env.PORT || 3001;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use("/api", apiLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationRouter);
app.use("/api/agents", agentRouter);
app.use("/api/calls", callRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/contacts", contactRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/queue", queueRouter);
app.use("/api/events", sseRouter);

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

export { app };
