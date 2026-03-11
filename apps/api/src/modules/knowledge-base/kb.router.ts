import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  // TODO: list knowledge sources for org
  res.json({ success: true, data: [] });
});

router.post("/", async (_req, res) => {
  // TODO: create knowledge source (file upload, URL, text, FAQ)
  res.status(201).json({ success: true, data: null });
});

router.get("/:id", async (_req, res) => {
  // TODO: get knowledge source details
  res.json({ success: true, data: null });
});

router.delete("/:id", async (_req, res) => {
  // TODO: delete knowledge source and its vectors
  res.status(204).send();
});

router.post("/:id/retrain", async (_req, res) => {
  // TODO: re-process and re-embed knowledge source
  res.json({ success: true, data: { status: "processing" } });
});

export { router as knowledgeBaseRouter };
