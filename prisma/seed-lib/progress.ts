import type { PrismaClient } from '../generated/client';

type ProgressClient = Pick<PrismaClient, 'seedProgress'>;

export async function isSeedStepComplete(
  prisma: ProgressClient,
  phase: string,
  subPhase: string,
): Promise<boolean> {
  return Boolean(await prisma.seedProgress.findUnique({
    where: { phase_subPhase: { phase, subPhase } },
    select: { id: true },
  }));
}

export async function markSeedStepComplete(
  prisma: ProgressClient,
  phase: string,
  subPhase: string,
): Promise<void> {
  await prisma.seedProgress.upsert({
    where: { phase_subPhase: { phase, subPhase } },
    create: { phase, subPhase },
    update: { doneAt: new Date() },
  });
}
