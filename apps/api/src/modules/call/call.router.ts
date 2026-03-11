import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  // TODO: list calls for org
  res.json({ success: true, data: [] });
});

router.get("/:id", async (_req, res) => {
  // TODO: get call details with transcript
  res.json({ success: true, data: null });
});

router.get("/:id/recording", async (_req, res) => {
  // TODO: get presigned URL for call recording
  res.json({ success: true, data: { url: null } });
});

export { router as callRouter };
