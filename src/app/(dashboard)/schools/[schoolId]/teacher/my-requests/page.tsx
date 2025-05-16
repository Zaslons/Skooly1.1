import { getVerifiedAuthUser, getScheduleChangeRequestsForTeacher } from "@/lib/actions";
import { redirect } from "next/navigation";
import MyRequestsClient from "./MyRequestsClient";
import { ScheduleChangeRequest, Lesson, Teacher, Subject, Class as PrismaClass, Day, RequestStatus, ScheduleChangeType } from "@prisma/client";

// Define a more specific type for the requests passed to the client
export interface PopulatedScheduleChangeRequest {
  id: string;
  requestingTeacherId: string;
  lessonId: number;
  requestedChangeType: ScheduleChangeType;
  proposedStartTime: string | null; // Dates are stringified for client
  proposedEndTime: string | null;   // Dates are stringified for client
  proposedDay: Day | null;
  proposedSwapTeacherId: string | null;
  reason: string;
  status: RequestStatus;
  adminNotes: string | null;
  schoolId: string;
  createdAt: string; // Dates are stringified for client
  updatedAt: string; // Dates are stringified for client
  lesson: {
    id: number;
    name: string;
    day: Day;
    startTime: string; // Dates are stringified for client
    endTime: string;   // Dates are stringified for client
    subject: { name: string; };
    class: { name: string; };
  };
  proposedSwapTeacher: {
    id: string;
    name: string;
    surname: string;
  } | null;
}

async function getPageData(schoolId: string) {
  // getScheduleChangeRequestsForTeacher already stringifies dates
  const requests = await getScheduleChangeRequestsForTeacher(schoolId) as PopulatedScheduleChangeRequest[];
  return { requests };
}

const MyRequestsPage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return redirect(`/sign-in?redirect=/schools/${schoolId}/teacher/my-requests`);
  }
  if (authUser.role !== 'teacher') {
    return <div className="p-4">Access Denied: This page is for teachers only.</div>;
  }
  if (authUser.schoolId !== schoolId) {
    return <div className="p-4">Access Denied: You are not authorized for this school.</div>;
  }
  if (!authUser.profileId) {
    return <div className="p-4">Error: Teacher profile ID not found.</div>;
  }

  const { requests } = await getPageData(schoolId);

  return (
    <MyRequestsClient
      initialRequests={requests}
      authUser={authUser}
      schoolId={schoolId}
    />
  );
};

export default MyRequestsPage; 