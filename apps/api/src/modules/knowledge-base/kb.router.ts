import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  // TODO: list knowledge sources for org
  res.json({ sources: [] });
});

router.post("/", async (_req, res) => {
  // TODO: create knowledge source (file upload, URL, text, FAQ)
  res.status(201).json({ source: null });
});

router.get("/:id", async (_req, res) => {
  // TODO: get knowledge source details
  res.json({ source: null });
});

router.delete("/:id", async (_req, res) => {
  // TODO: delete knowledge source and its vectors
  res.status(204).send();
});

router.post("/:id/retrain", async (_req, res) => {
  // TODO: re-process and re-embed knowledge source
  res.json({ status: "processing" });
});

export { router as knowledgeBaseRouter };
