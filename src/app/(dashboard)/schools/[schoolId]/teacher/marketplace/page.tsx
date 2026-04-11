import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import MarketplaceProfileClient from "./MarketplaceProfileClient";

export default async function TeacherMarketplacePage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) return <div>User not authenticated.</div>;
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId)))
    return <div>Access Denied.</div>;
  if (authUser.role !== "teacher")
    return <div>Access Denied: This page is for teachers only.</div>;

  return (
    <div className="p-6">
      <MarketplaceProfileClient schoolId={schoolId} />
    </div>
  );
}
