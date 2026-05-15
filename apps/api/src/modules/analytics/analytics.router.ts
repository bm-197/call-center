import { Router } from 'express';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';

const router = Router();

router.use(requireAuth, requireOrgMember());

router.get('/overview', async (req, res, next) => {
  try {
    const orgId = req.activeOrganizationId!;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      activeCalls,
      callsToday,
      avgHandleTime,
      activeAgents,
      totalAgents,
      runningCampaigns,
      queuedCampaignRecipients,
    ] = await Promise.all([
      prisma.call.count({
        where: {
          organizationId: orgId,
          status: {
            in: ['ringing', 'in_progress', 'ai_handling', 'human_handling'],
          },
        },
      }),
      prisma.call.count({
        where: { organizationId: orgId, startedAt: { gte: startOfToday } },
      }),
      prisma.call.aggregate({
        where: {
          organizationId: orgId,
          status: 'completed',
          startedAt: { gte: last24h },
          duration: { not: null },
        },
        _avg: { duration: true },
      }),
      prisma.agent.count({
        where: { organizationId: orgId, status: 'active' },
      }),
      prisma.agent.count({ where: { organizationId: orgId } }),
      prisma.campaign.count({
        where: { organizationId: orgId, status: 'running' },
      }),
      prisma.campaignRecipient.count({
        where: { organizationId: orgId, status: 'queued' },
      }),
    ]);

    res.json({
      activeCalls,
      callsToday,
      avgHandleTimeSeconds: Math.round(avgHandleTime._avg.duration ?? 0),
      activeAgents,
      totalAgents,
      runningCampaigns,
      queuedCampaignRecipients,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/calls', async (_req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/agents', async (_req, res) => {
  res.json({ success: true, data: [] });
});

export { router as analyticsRouter };
