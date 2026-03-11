import { Router } from "express";

const router = Router();

router.get("/current", async (_req, res) => {
  // TODO: get current user's org
  res.json({ organization: null });
});

router.patch("/current", async (_req, res) => {
  // TODO: update org settings
  res.json({ organization: null });
});

router.get("/current/members", async (_req, res) => {
  // TODO: list org members
  res.json({ members: [] });
});

router.post("/current/invite", async (_req, res) => {
  // TODO: invite member to org
  res.status(201).json({ invitation: null });
});

export { router as organizationRouter };
