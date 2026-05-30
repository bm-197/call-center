import { Router } from 'express';
import { prisma } from '@call-center/db';
import {
  requireAuth,
  requireOrgMember,
} from '../../common/middleware/require-auth.js';
import { AppError } from '../../common/middleware/error-handler.js';
import { acceptHandoffCall } from '../../realtime/conversation-orchestrator.js';

const router = Router();

router.use(requireAuth, requireOrgMember('agent'));

const queueCallSelect = {
  id: true,
  direction: true,
  callerNumber: true,
  calleeNumber: true,
  status: true,
  handedOff: true,
  handoffReason: true,
  handoffTime: true,
  humanAgentId: true,
  startedAt: true,
  agent: { select: { id: true, name: true } },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
    },
  },
} as const;

router.get('/', async (req, res, next) => {
  try {
    const organizationId = req.activeOrganizationId!;
    const [waiting, active, items] = await Promise.all([
      prisma.call.count({
        where: { organizationId, status: 'queued', handedOff: true },
      }),
      prisma.call.count({
        where: { organizationId, status: 'human_handling' },
      }),
      prisma.call.findMany({
        where: {
          organizationId,
          status: { in: ['queued', 'human_handling'] },
          handedOff: true,
        },
        orderBy: { handoffTime: 'asc' },
        take: 50,
        select: queueCallSelect,
      }),
    ]);

    res.json({ waiting, active, items });
  } catch (err) {
    next(err);
  }
});

router.post('/:callId/accept', async (req, res, next) => {
  try {
    const organizationId = req.activeOrganizationId!;
    const member = await prisma.member.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user!.id,
          organizationId,
        },
      },
      select: { id: true },
    });
    if (!member) throw new AppError(403, 'Not a member of this organization');

    const call = await acceptHandoffCall({
      organizationId,
      callId: req.params.callId,
      memberId: member.id,
    });
    if (!call) throw new AppError(404, 'Call not found');
    res.json(call);
  } catch (err) {
    next(err);
  }
});

export { router as queueRouter };
