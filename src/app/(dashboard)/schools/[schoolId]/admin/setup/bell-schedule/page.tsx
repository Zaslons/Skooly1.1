import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import BellScheduleClient from "./BellScheduleClient";

export default async function BellSchedulePage({ params }: { params: { schoolId: string } }) {
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

  return <BellScheduleClient schoolId={schoolId} />;
}
