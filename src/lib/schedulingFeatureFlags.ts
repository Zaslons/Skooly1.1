import prisma from "@/lib/prisma";

/**
 * E7: per-school kill switch for commit-style scheduling (term generation commit, DS recurring commit).
 * Dry-runs and calendar reads remain available.
 */
export async function isSchedulingPipelineCommitEnabled(schoolId: string): Promise<boolean> {
  const row = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { schedulingPipelineEnabled: true },
  });
  return row?.schedulingPipelineEnabled !== false;
}
