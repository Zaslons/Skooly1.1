import Announcements from "@/components/Announcements";
import BigCalendarContainer from "@/components/BigCalendarContainer";
import { getVerifiedAuthUser } from "@/lib/actions";

const TeacherPage = async ({
  params,
}: {
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'teacher') {
    return <div>Access Denied: This page is for teachers only.</div>;
  }

  return (
    <div className="flex-1 p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        <div className="h-full bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold">Schedule</h1>
          {authUser && (
            <BigCalendarContainer
              type="teacherId"
              id={authUser.id}
              schoolId={schoolId}
            />
          )}
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-8">
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default TeacherPage;
