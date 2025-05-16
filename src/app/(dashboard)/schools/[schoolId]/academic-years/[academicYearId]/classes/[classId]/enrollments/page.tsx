import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken, AuthUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import EnrollmentsClient from './EnrollmentsClient'; // To be created
import { AcademicYear, Class, Student, StudentEnrollmentHistory } from '@prisma/client';

// Helper to get current authenticated user (consistent with other pages)
async function getCurrentUserOnPage(): Promise<AuthUser | null> {
  const tokenCookie = cookies().get('auth_token');
  if (!tokenCookie) return null;
  return verifyToken(tokenCookie.value);
}

export type EnrolledStudentWithDetails = StudentEnrollmentHistory & {
  student: Pick<Student, 'id' | 'name' | 'surname' | 'email'>; // Changed to name, surname
};

// For the student selection dropdown, basic student info
export type StudentForEnrollment = Pick<Student, 'id' | 'name' | 'surname' | 'email'>; // Changed to name, surname


interface EnrollmentsPageProps {
  params: {
    schoolId: string;
    academicYearId: string;
    classId: string; // Prisma schema indicates Class.id is Int, so this will need parsing
  };
}

export default async function EnrollmentsPage({ params }: EnrollmentsPageProps) {
  const { schoolId, academicYearId } = params;
  const classIdInt = parseInt(params.classId, 10);

  if (isNaN(classIdInt)) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-semibold text-red-600">Invalid Class ID</h1>
        <p>The Class ID provided is not a valid number.</p>
      </div>
    );
  }

  // Authentication
  const currentUser = await getCurrentUserOnPage();
  if (!currentUser) {
    redirect(`/sign-in?callbackUrl=/schools/${schoolId}/academic-years/${academicYearId}/classes/${classIdInt}/enrollments`);
  }

  // Fetch Core Data (Academic Year and Class)
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: academicYearId, schoolId: schoolId, isArchived: false },
  });

  const classDetails = await prisma.class.findUnique({
    where: { id: classIdInt, schoolId: schoolId, academicYearId: academicYearId },
    include: { grade: { select: { id: true, level: true } } } // Assuming Class has grade and Grade has level
  });

  if (!academicYear) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-semibold text-red-600">Academic Year Not Found</h1>
        <p>The specified academic year could not be found, is archived, or does not belong to this school.</p>
      </div>
    );
  }

  if (!classDetails) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-semibold text-red-600">Class Not Found</h1>
        <p>The specified class could not be found or does not belong to this academic year/school.</p>
      </div>
    );
  }

  // Authorization
  let authorized = false;
  if (currentUser.schoolId === schoolId) {
    if (currentUser.role === 'admin') {
      authorized = true;
    } else if (currentUser.role === 'teacher') {
      // AuthUser.id is Auth.id. Teacher model has authId linking to Auth.id.
      // Teacher model also has its own CUID primary key `id`.
      // Class.supervisorId links to Teacher.id (the CUID).
      const teacherProfile = await prisma.teacher.findUnique({ 
        where: { authId: currentUser.id },
        select: { id: true } // We only need the Teacher's CUID primary key
      });
      if (teacherProfile && classDetails.supervisorId === teacherProfile.id) {
        authorized = true;
      }
    }
  }

  if (!authorized) {
    // Redirect to a general dashboard or an unauthorized page
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-semibold text-red-600">Unauthorized</h1>
        <p>You do not have permission to manage enrollments for this class.</p>
      </div>
    );
  }

  // Fetch Enrolled Students
  const enrolledStudents: EnrolledStudentWithDetails[] = await prisma.studentEnrollmentHistory.findMany({
    where: {
      // schoolId: schoolId, // Removed as per analysis - academicYearId implies schoolId
      academicYearId: academicYearId,
      classId: classIdInt,
      departureDate: null, // Actively enrolled
    },
    include: {
      student: {
        select: { id: true, name: true, surname: true, email: true }, // Changed to name, surname
      },
    },
    orderBy: {
      student: { surname: 'asc' } // Changed to surname
    }
  });

  // Fetch all students in the school for the enrollment dropdown
  const allStudentsInSchool: StudentForEnrollment[] = await prisma.student.findMany({
    where: {
      schoolId: schoolId,
    },
    select: {
      id: true,
      name: true, // Changed to name
      surname: true, // Changed to surname
      email: true,
    },
    orderBy: {
      surname: 'asc', // Changed to surname
    }
  });


  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-1">Manage Student Enrollments</h1>
      <h2 className="text-lg text-gray-700 mb-2">
        Academic Year: {academicYear.name} ({new Date(academicYear.startDate).toLocaleDateString()} - {new Date(academicYear.endDate).toLocaleDateString()})
      </h2>
      <h3 className="text-md text-gray-600 mb-4">
        Class: {classDetails.name} (Grade: {classDetails.grade?.level || 'N/A'}) 
      </h3>
      <EnrollmentsClient
        schoolId={schoolId}
        academicYearId={academicYearId}
        classId={classIdInt}
        initialEnrolledStudents={JSON.parse(JSON.stringify(enrolledStudents))}
        allStudentsInSchool={JSON.parse(JSON.stringify(allStudentsInSchool))}
        initialAcademicYearName={academicYear.name} // Prop for display
        initialClassName={classDetails.name} // Prop for display
      />
    </div>
  );
} 