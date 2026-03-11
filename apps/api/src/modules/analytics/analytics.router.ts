import { Router } from "express";

const router = Router();

router.get("/overview", async (_req, res) => {
  // TODO: call volume, avg duration, resolution rate, AI vs human ratio
  res.json({ overview: null });
});

router.get("/calls", async (_req, res) => {
  // TODO: call analytics with date range filters
  res.json({ data: [] });
});

router.get("/agents", async (_req, res) => {
  // TODO: per-agent performance metrics
  res.json({ data: [] });
});

export { router as analyticsRouter };
