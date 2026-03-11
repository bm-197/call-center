import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  // TODO: list agents for org
  res.json({ success: true, data: [] });
});

router.post("/", async (_req, res) => {
  // TODO: create agent
  res.status(201).json({ success: true, data: null });
});

router.get("/:id", async (_req, res) => {
  // TODO: get agent by id
  res.json({ success: true, data: null });
});

router.patch("/:id", async (_req, res) => {
  // TODO: update agent
  res.json({ success: true, data: null });
});

router.delete("/:id", async (_req, res) => {
  // TODO: delete agent
  res.status(204).send();
});

export { router as agentRouter };
