import { getServerUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import GradingScaleClient from "./GradingScaleClient";

export default async function GradingScaleAdminPage({
  params,
}: {
  params: { schoolId: string };
}) {
  const { schoolId } = await params;
  const user = await getServerUser();

  if (!user) {
    redirect("/sign-in?message=Please sign in to view this page.");
  }

  const isAdminOfSchool =
    user.role === "admin" && user.schoolId === schoolId;
  const isSystemAdmin = user.role === "system_admin";

  if (!isAdminOfSchool && !isSystemAdmin) {
    return (
      <div className="p-6 text-center text-red-600 font-medium">
        Access Denied: You must be an admin of this school to view grading scales.
      </div>
    );
  }

  const gradingScales = await prisma.gradingScale.findMany({
    where: { schoolId },
    include: {
      bands: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <GradingScaleClient schoolId={schoolId} initialScales={gradingScales as any} />
    </div>
  );
}
