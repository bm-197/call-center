import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  res.json({ contacts: [] });
});

router.post("/", async (_req, res) => {
  res.status(201).json({ contact: null });
});

router.get("/:id", async (_req, res) => {
  res.json({ contact: null });
});

router.patch("/:id", async (_req, res) => {
  res.json({ contact: null });
});

export { router as contactRouter };
