import { Router } from "express";

const router = Router();

// Better Auth handles these routes — see apps/api/src/modules/auth/auth.ts
// This router is a passthrough to Better Auth's handler

router.all("/*splat", (req, res) => {
  // TODO: wire up Better Auth handler
  res.status(501).json({ error: "Auth not yet configured" });
});

export { router as authRouter };
