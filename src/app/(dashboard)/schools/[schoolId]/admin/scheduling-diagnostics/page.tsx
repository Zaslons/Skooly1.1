import { getVerifiedAuthUser } from "@/lib/actions";
import { assertSchoolAccessForServerUser } from "@/lib/schoolAccess";
import SchedulingDiagnosticsClient from "./SchedulingDiagnosticsClient";

const SchedulingDiagnosticsPage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated. Please sign in.</div>;
  }
  if (!(await assertSchoolAccessForServerUser(authUser, schoolId))) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }
  if (authUser.role !== "admin") {
    return <div>Access Denied: This page is for administrators only.</div>;
  }

  return <SchedulingDiagnosticsClient schoolId={schoolId} />;
};

export default SchedulingDiagnosticsPage;
