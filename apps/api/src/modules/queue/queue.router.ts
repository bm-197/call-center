import { Router } from "express";

const router = Router();

router.get("/", async (_req, res) => {
  // TODO: get current queue status (waiting calls, active agents)
  res.json({ success: true, data: { waiting: 0, active: 0 } });
});

router.post("/:callId/accept", async (_req, res) => {
  // TODO: human agent accepts a call from the queue
  res.json({ success: true, data: { status: "accepted" } });
});

router.post("/:callId/transfer", async (_req, res) => {
  // TODO: transfer call to another agent or back to AI
  res.json({ success: true, data: { status: "transferred" } });
});

export { router as queueRouter };
