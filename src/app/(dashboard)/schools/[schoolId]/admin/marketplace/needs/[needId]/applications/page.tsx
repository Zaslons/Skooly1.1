import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import NeedApplicationsClient from "./NeedApplicationsClient";

export default async function NeedApplicationsPage({
  params,
}: {
  params: Promise<{ schoolId: string; needId: string }>;
}) {
  const { schoolId, needId } = await params;
  const authUser = await getVerifiedAuthUser();
  if (!authUser) return <div>User not authenticated.</div>;
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId)))
    return <div>Access Denied.</div>;
  if (authUser.role !== "admin") return <div>Access Denied.</div>;

  return (
    <div className="p-6">
      <NeedApplicationsClient schoolId={schoolId} needId={needId} />
    </div>
  );
}
