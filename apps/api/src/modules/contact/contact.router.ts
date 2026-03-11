import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  res.json({ success: true, data: [] });
});

router.post("/", async (_req, res) => {
  res.status(201).json({ success: true, data: null });
});

router.get("/:id", async (_req, res) => {
  res.json({ success: true, data: null });
});

router.patch("/:id", async (_req, res) => {
  res.json({ success: true, data: null });
});

export { router as contactRouter };
