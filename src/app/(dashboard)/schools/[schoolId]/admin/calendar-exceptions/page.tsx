import prisma from "@/lib/prisma";
import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import CalendarExceptionsClient from "./CalendarExceptionsClient";

export default async function CalendarExceptionsPage({ params }: { params: { schoolId: string } }) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div className="p-4 md:p-6">User not authenticated. Please sign in.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div className="p-4 md:p-6">Access Denied: You are not authorized for this school.</div>;
  }
  if (authUser.role !== "admin") {
    return <div className="p-4 md:p-6">Access Denied: This page is for administrators only.</div>;
  }

  const terms = await prisma.term.findMany({
    where: { schoolId },
    select: { id: true, name: true, startDate: true, endDate: true, isActive: true, isArchived: true },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  const initialTerm = terms.find((t) => t.isActive) ?? terms[0] ?? null;

  return (
    <CalendarExceptionsClient
      schoolId={schoolId}
      terms={terms.map((t) => ({
        ...t,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate.toISOString(),
      }))}
      initialTermId={initialTerm?.id ?? null}
    />
  );
}
