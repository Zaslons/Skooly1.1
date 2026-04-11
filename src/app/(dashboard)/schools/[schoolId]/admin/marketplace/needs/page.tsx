import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import AdminNeedsClient from "./AdminNeedsClient";

export default async function AdminNeedsPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();
  if (!authUser) return <div>User not authenticated.</div>;
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId)))
    return <div>Access Denied.</div>;
  if (authUser.role !== "admin") return <div>Access Denied.</div>;

  return (
    <div className="p-6">
      <AdminNeedsClient schoolId={schoolId} />
    </div>
  );
}
