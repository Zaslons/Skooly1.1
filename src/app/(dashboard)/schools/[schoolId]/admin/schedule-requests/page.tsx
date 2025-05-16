import { getScheduleChangeRequestsForAdmin } from "@/lib/actions";
import { Day, Lesson, Subject, Class, Teacher, ScheduleChangeRequest, ScheduleChangeType, RequestStatus } from "@prisma/client";
import AdminScheduleRequestsClient from "./AdminScheduleRequestsClient";

// Define the detailed shape of the request object returned by the action
// Ensure all dates are strings as they are serialized by JSON.parse(JSON.stringify())
export interface PopulatedLessonForAdmin {
  id: number;
  name: string;
  day: Day;
  startTime: string; // Serialized Date
  endTime: string;   // Serialized Date
  subject: { id: number; name: string; };
  class: { id: number; name: string; };
  teacher: { id: string; name: string; surname: string; }; // Original teacher
}

export interface BasicTeacherInfo {
  id: string;
  name: string;
  surname: string;
  email?: string | null;
}

export interface PopulatedScheduleChangeRequestForAdmin {
  id: string;
  lessonId: number;
  requestingTeacherId: string;
  requestedChangeType: ScheduleChangeType;
  proposedStartTime?: string | null; // Serialized Date
  proposedEndTime?: string | null;   // Serialized Date
  proposedDay?: Day | null;
  proposedSwapTeacherId?: string | null;
  reason: string;
  status: RequestStatus;
  adminNotes?: string | null;
  createdAt: string; // Serialized Date
  updatedAt: string; // Serialized Date
  schoolId: string;
  lesson: PopulatedLessonForAdmin;
  requestingTeacher: BasicTeacherInfo;
  proposedSwapTeacher?: BasicTeacherInfo | null;
}

interface AdminScheduleRequestsPageProps {
  params: {
    schoolId: string;
  };
}

const AdminScheduleRequestsPage = async ({ params }: AdminScheduleRequestsPageProps) => {
  const { schoolId } = params;
  const requests: PopulatedScheduleChangeRequestForAdmin[] = await getScheduleChangeRequestsForAdmin(schoolId);

  return (
    <AdminScheduleRequestsClient 
      initialRequests={requests} 
      schoolId={schoolId} 
    />
  );
};

export default AdminScheduleRequestsPage; 