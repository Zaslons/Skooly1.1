import prisma from "@/lib/prisma";
import FormModal from "./FormModal";
import ModalTriggerButton from "./ModalTriggerButton";
// import { auth } from "@clerk/nextjs/server"; // Removed Clerk auth
import type { AuthUser } from "@/lib/auth"; // Import your AuthUser type

export type FormContainerProps = {
  table:
    | "teacher"
    | "student"
    | "parent"
    | "subject"
    | "class"
    | "lesson"
    | "exam"
    | "assignment"
    | "result"
    | "attendance"
    | "event"
    | "announcement"
    | "grade"
    | "school"
    | "admin"
    | "room"; // Added "room" to the union type
  type: "create" | "update" | "delete";
  data?: any;
  id?: number | string;
  authUser: AuthUser | null; // Added authUser prop
};

const FormContainer = async ({ table, type, data, id, authUser, ...restProps }: FormContainerProps & Record<string, any>) => {
  let relatedData = {};

  // const { userId, sessionClaims } = auth(); // Removed Clerk auth
  // const metadata = sessionClaims?.metadata as { role?: string; schoolId?: string }; // Removed
  // const role = metadata?.role; // Removed
  // const schoolId = metadata?.schoolId; // Removed
  // const currentUserId = userId; // Removed

  if (!authUser) {
    // This case should ideally be handled by the parent component not rendering FormContainer
    // or FormContainer rendering nothing/an error if authUser is unexpectedly null.
    console.error("FormContainer: authUser prop is null.");
    return <div>Error: Authentication information is missing.</div>; // Or return null
  }

  const role = authUser.role;
  const schoolId = authUser.schoolId; // Can be string | null | undefined
  const currentUserId = authUser.id; // Assuming your AuthUser type has an 'id' field for the user's own ID

  // Initial check for schoolId based on role
  if (!schoolId && role !== 'system_admin') { 
    console.error("User is not associated with a school or is not a system_admin.");
    // Allow 'school' creation even if schoolId is not set (e.g., for a new system_admin or user)
    if (table === "school" && type === "create") {
        // Allow proceeding for school creation form
    } else {
        return <div>Error: User not associated with a school.</div>;
    }
  }

  // Fetch related data only if schoolId is available (it's a string)
  // and type is not 'delete' (as delete forms typically don't need extra related data)
  if (type !== "delete" && schoolId) { 
    switch (table) {
      case "subject":
        const subjectTeachers = await prisma.teacher.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true, surname: true },
        });
        relatedData = { teachers: subjectTeachers };
        break;
      case "class":
        const classGrades = await prisma.grade.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, level: true },
        });
        const classTeachers = await prisma.teacher.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true, surname: true },
        });
        const academicYears = await prisma.academicYear.findMany({
          where: { schoolId: schoolId, isArchived: false },
          select: { id: true, name: true },
          orderBy: { startDate: 'desc' } // Show most recent first
        });
        relatedData = { teachers: classTeachers, grades: classGrades, academicYears: academicYears };
        break;
      case "teacher":
        const teacherSubjects = await prisma.subject.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true },
        });
        relatedData = { subjects: teacherSubjects };
        break;
      case "student":
        const studentGrades = await prisma.grade.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, level: true },
        });
        const studentClasses = await prisma.class.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          include: { _count: { select: { students: true } } },
        });
        const studentParents = await prisma.parent.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true, surname: true },
        });
        console.log("Parents data:", studentParents);
        relatedData = { classes: studentClasses, grades: studentGrades, parents: studentParents };
        break;
      case "exam":
        const examLessons = await prisma.lesson.findMany({
          where: {
            schoolId: schoolId, // schoolId is confirmed string here
            ...(role === "teacher" ? { teacher: { authId: currentUserId! } } : {}),
          },
          select: { id: true, name: true },
        });
        relatedData = { lessons: examLessons };
        break;
      case "lesson":
        const lessonSubjects = await prisma.subject.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true },
        });
        const lessonClasses = await prisma.class.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true },
        });
        const lessonTeachers = await prisma.teacher.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { 
              id: true, 
              name: true, 
              surname: true, 
              subjects: { select: { id: true } }
            },
          orderBy: [{ surname: 'asc' }, { name: 'asc' }],
        });
        const lessonRooms = await prisma.room.findMany({
          where: { schoolId: schoolId },
          select: { id: true, name: true, type: true, capacity: true },
          orderBy: { name: 'asc' },
        });
        relatedData = { subjects: lessonSubjects, classes: lessonClasses, teachers: lessonTeachers, rooms: lessonRooms };
        break;
      case "assignment":
        const assignmentLessons = await prisma.lesson.findMany({
          where: {
            schoolId: schoolId, // schoolId is confirmed string here
            ...(role === "teacher" ? { teacher: { authId: currentUserId! } } : {}),
          },
          select: { id: true, name: true },
        });
        relatedData = { lessons: assignmentLessons };
        break;
      case "result":
        const resultStudents = await prisma.student.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true, surname: true },
        });
        const resultExams = await prisma.exam.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, title: true },
        });
        const resultAssignments = await prisma.assignment.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, title: true },
        });
        relatedData = { students: resultStudents, exams: resultExams, assignments: resultAssignments };
        break;
      case "announcement":
      case "event":
        const eventClasses = await prisma.class.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        // --- NEW: Fetch Rooms for Event Form ---
        const eventRooms = await prisma.room.findMany({
          where: { schoolId: schoolId }, // schoolId is confirmed string here
          select: { id: true, name: true, type: true, capacity: true },
          orderBy: { name: 'asc' },
        });
        relatedData = { classes: eventClasses, rooms: eventRooms, schoolId };
        break;
      case "attendance":
        const lessonId = data?.lessonId || id; // Assuming 'id' could be lessonId for attendance context
        if (lessonId) {
          // If lessonId is directly provided, use it. 
          // We might still want to verify this lesson belongs to the schoolId if schoolId is available.
          relatedData = { lessonId };
        } else {
          const attendanceLessons = await prisma.lesson.findMany({
            where: {
              schoolId: schoolId, // schoolId is confirmed string here
              ...(role === "teacher" ? { teacher: { authId: currentUserId! } } : {}),
            },
            select: { id: true, name: true },
          });
          relatedData = { lessons: attendanceLessons };
        }
        break;
      // Note: Case "school" for related data is not handled here,
      // as school creation typically doesn't need pre-fetched related data from a schoolId.
      default:
        break;
    }
  }

  // Final check before rendering ModalTriggerButton
  // If it's not for school creation, and schoolId is still missing (e.g. system_admin without school context for non-school table)
  if (table !== "school" && !schoolId) {
     return <div>Error: School context is required for this form.</div>;
  }

  console.log("[FormContainer] Props received - type:", type, "table:", table, "data (initialData):", JSON.stringify(data, null, 2));

  const componentProps = {
    table,
    type,
    data,
    id,
    authUser, // Added authUser
    relatedData: {
      ...relatedData,
      ...restProps
    }
  };

  return (
    <ModalTriggerButton {...componentProps} />
  );
};

export default FormContainer;
