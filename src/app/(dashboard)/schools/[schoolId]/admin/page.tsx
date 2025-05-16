import Announcements from "@/components/Announcements";
import AttendanceChartContainer from "@/components/AttendanceChartContainer";
import CountChartContainer from "@/components/CountChartContainer";
import EventCalendarContainer from "@/components/EventCalendarContainer";
import FinanceChart from "@/components/FinanceChart";
import UserCard from "@/components/UserCard";
import prisma from "@/lib/prisma"; // Import Prisma
import { AcademicYear } from "@prisma/client"; // Import type if needed for the new component
import Link from 'next/link'; // For quick links

// Define a type for the stats we'll pass to a display component
interface ActiveAcademicYearStatsProps {
  academicYearName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  classCount: number;
  enrolledStudentsCount: number;
  schoolId: string;
  academicYearId: string | null;
}

// A simple component to display the stats (can be moved to its own file later)
const ActiveAcademicYearInfo: React.FC<ActiveAcademicYearStatsProps> = ({ 
  academicYearName, startDate, endDate, classCount, enrolledStudentsCount, schoolId, academicYearId 
}) => {
  if (!academicYearName) {
    return (
      <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg text-yellow-700">
        <p className="font-semibold">No Active Academic Year</p>
        <p className="text-sm">There is currently no active academic year set for this school, or the active year is archived.</p>
        <Link href={`/schools/${schoolId}/academic-years`} className="text-sm text-blue-600 hover:underline mt-1 inline-block">
          Manage Academic Years
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm mb-6">
      <h2 className="text-xl font-semibold text-blue-700 mb-2">
        Active Academic Year: {academicYearName}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-gray-600">Duration:</p>
          <p className="font-medium text-gray-800">
            {startDate ? new Date(startDate).toLocaleDateString() : 'N/A'} - {endDate ? new Date(endDate).toLocaleDateString() : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-gray-600">Active Classes:</p>
          <p className="font-medium text-gray-800">{classCount}</p>
        </div>
        <div>
          <p className="text-gray-600">Students Enrolled (in this AY):</p>
          <p className="font-medium text-gray-800">{enrolledStudentsCount}</p>
        </div>
      </div>
      {academicYearId && (
         <div className="mt-3 flex space-x-3">
            <Link href={`/schools/${schoolId}/academic-years/${academicYearId}/curriculum`} className="text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded-md">
                View Curriculum
            </Link>
            <Link href={`/schools/${schoolId}/academic-years/${academicYearId}/classes`} className="text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded-md">
                Manage Classes
            </Link>
        </div>
      )}
    </div>
  );
};

const AdminPage = async ({
  searchParams,
  params
}: {
  searchParams: { [keys: string]: string | undefined };
  params: { schoolId: string };
}) => {
  const { schoolId } = params;

  // Fetch active academic year and related stats
  let activeAcademicYearName: string | null = null;
  let activeAyStartDate: Date | null = null;
  let activeAyEndDate: Date | null = null;
  let activeClassCount = 0;
  let currentEnrolledStudents = 0;
  let activeAcademicYearId: string | null = null;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeAcademicYearId: true }
  });

  if (school && school.activeAcademicYearId) {
    const academicYear = await prisma.academicYear.findUnique({
      where: { 
        id: school.activeAcademicYearId,
        isArchived: false // Ensure the active AY is not archived
      },
      select: { id: true, name: true, startDate: true, endDate: true }
    });

    if (academicYear) {
      activeAcademicYearId = academicYear.id;
      activeAcademicYearName = academicYear.name;
      activeAyStartDate = academicYear.startDate;
      activeAyEndDate = academicYear.endDate;

      activeClassCount = await prisma.class.count({
        where: {
          schoolId: schoolId,
          academicYearId: academicYear.id
        }
      });

      currentEnrolledStudents = await prisma.studentEnrollmentHistory.count({
        where: {
          academicYearId: academicYear.id,
          // class: { schoolId: schoolId }, // Not needed, AY implies school
          departureDate: null // Only currently enrolled students
        }
      });
    }
  }

  return (
    <div className="p-4 flex gap-4 flex-col md:flex-row">
      {/* LEFT */}
      <div className="w-full lg:w-2/3 flex flex-col gap-8">
        {/* Display Active Academic Year Info First */}
        <ActiveAcademicYearInfo 
          academicYearName={activeAcademicYearName}
          startDate={activeAyStartDate}
          endDate={activeAyEndDate}
          classCount={activeClassCount}
          enrolledStudentsCount={currentEnrolledStudents}
          schoolId={schoolId}
          academicYearId={activeAcademicYearId}
        />

        {/* USER CARDS */}
        <div className="flex gap-4 justify-between flex-wrap">
          <UserCard type="admin" schoolId={schoolId} />
          <UserCard type="teacher" schoolId={schoolId} />
          <UserCard type="student" schoolId={schoolId} />
          <UserCard type="parent" schoolId={schoolId} />
        </div>
        {/* MIDDLE CHARTS */}
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* COUNT CHART */}
          <div className="w-full lg:w-1/3 h-[450px]">
            <CountChartContainer schoolId={schoolId} />
          </div>
          {/* ATTENDANCE CHART */}
          <div className="w-full lg:w-2/3 h-[450px]">
            <AttendanceChartContainer schoolId={schoolId} />
          </div>
        </div>
        {/* BOTTOM CHART */}
        <div className="w-full h-[500px]">
          <FinanceChart />
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full lg:w-1/3 flex flex-col gap-8">
        <EventCalendarContainer searchParams={searchParams} schoolId={schoolId}/>
        <Announcements schoolId={schoolId} />
      </div>
    </div>
  );
};

export default AdminPage;
