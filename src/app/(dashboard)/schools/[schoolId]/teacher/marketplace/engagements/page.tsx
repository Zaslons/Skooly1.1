import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import TeacherEngagementsClient from "./TeacherEngagementsClient";
import TeacherMarketplaceNav from "@/components/marketplace/TeacherMarketplaceNav";

export default async function TeacherEngagementsPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();
  if (!authUser) return <div>User not authenticated.</div>;
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId)))
    return <div>Access Denied.</div>;
  if (authUser.role !== "teacher") return <div>Access Denied.</div>;

  return (
    <div className="p-6">
      <TeacherMarketplaceNav schoolId={schoolId} />
      <TeacherEngagementsClient />
    </div>
  );
}
