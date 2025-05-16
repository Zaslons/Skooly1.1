import prisma from "@/lib/prisma";
import Link from "next/link";
import { CalendarCheck, CalendarX, User } from "lucide-react";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

export default async function ParentAttendancePage({ 
    params
}: {
    params: { schoolId: string }
}) {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

  if (authUser.role !== 'parent') {
    return <div>Access Denied: This page is for parents only.</div>;
  }

  // Get the parent's children with basic attendance stats, ensuring parent belongs to the school
  const parent = await prisma.parent.findUnique({
    where: {
      authId: authUser.id,
    },
    include: {
      students: {
        where: { schoolId: schoolId },
        include: {
          attendances: true,
          class: true,
          grade: true,
        },
      },
    },
  });

  if (!parent) {
    return <div className="p-4">Parent profile not found for the authenticated user in this school.</div>;
  }

  // Calculate attendance statistics for each child
  const childrenWithStats = parent.students.map(student => {
    const totalAttendance = student.attendances.length;
    const presentCount = student.attendances.filter(a => a.present).length;
    const absentCount = totalAttendance - presentCount;
    const attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

    return {
      ...student,
      stats: {
        totalAttendance,
        presentCount,
        absentCount,
        attendanceRate,
      }
    };
  });

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Children&apos;s Attendance</h1>
        <p className="text-gray-600">
          View attendance records for your children
        </p>
      </div>

      {childrenWithStats.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-600">No children found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {childrenWithStats.map(child => (
            <div key={child.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b">
                <div className="flex items-center">
                  {child.img ? (
                    <Image
                      src={child.img}
                      alt={`${child.name} ${child.surname}`}
                      width={48}
                      height={48}
                      className="rounded-full mr-3"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                      <User className="h-6 w-6 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold text-lg">{`${child.name} ${child.surname}`}</h2>
                    <p className="text-sm text-gray-600">
                      Grade {child.grade.level}, Class {child.class.name}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="border rounded p-3 flex flex-col items-center">
                    <CalendarCheck className="h-5 w-5 text-green-500 mb-1" />
                    <div className="text-xl font-bold">{child.stats.presentCount}</div>
                    <div className="text-xs text-gray-500">Present</div>
                  </div>
                  <div className="border rounded p-3 flex flex-col items-center">
                    <CalendarX className="h-5 w-5 text-red-500 mb-1" />
                    <div className="text-xl font-bold">{child.stats.absentCount}</div>
                    <div className="text-xs text-gray-500">Absent</div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Attendance Rate</span>
                    <span className="text-sm font-medium">{child.stats.attendanceRate}%</span>
                  </div>
                  <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        child.stats.attendanceRate > 80
                          ? "bg-green-500"
                          : child.stats.attendanceRate > 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${child.stats.attendanceRate}%` }}
                    ></div>
                  </div>
                </div>

                <Link
                  href={`/schools/${schoolId}/parent/attendance/${child.id}`}
                  className="w-full block text-center p-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
                >
                  View Detailed Attendance
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 