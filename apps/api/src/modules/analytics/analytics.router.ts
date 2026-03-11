import { Router } from "express";

const router = Router();

router.get("/overview", async (_req, res) => {
  // TODO: call volume, avg duration, resolution rate, AI vs human ratio
  res.json({ success: true, data: null });
});

router.get("/calls", async (_req, res) => {
  // TODO: call analytics with date range filters
  res.json({ success: true, data: [] });
});

router.get("/agents", async (_req, res) => {
  // TODO: per-agent performance metrics
  res.json({ success: true, data: [] });
});

export { router as analyticsRouter };
