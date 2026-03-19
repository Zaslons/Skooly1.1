import prisma from "@/lib/prisma";
import { getServerUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";
import { format } from "date-fns";

export default async function StudentAttendancePage({ 
    params
}: {
    params: { schoolId: string }
}) {
  const { schoolId } = await params;
  const user = await getServerUser();

  if (!user || user.role !== 'student' || user.schoolId !== schoolId) {
    redirect('/');
  }

  const student = await prisma.student.findFirst({
    where: {
      authId: user.id,
      schoolId,
    },
    include: {
      attendances: {
        include: {
          lesson: {
            include: {
              subject: true,
            },
          },
        },
        orderBy: {
          date: "desc",
        },
      },
    },
  });

  if (!student) {
    return <div className="p-4">Student not found</div>;
  }

  const totalAttendance = student.attendances.length;
  const presentCount = student.attendances.filter(a => a.status === "PRESENT").length;
  const absentCount = student.attendances.filter(a => a.status === "ABSENT").length;
  const lateCount = student.attendances.filter(a => a.status === "LATE").length;
  const attendanceRate = totalAttendance ? Math.round((presentCount / totalAttendance) * 100) : 0;

  const attendanceByDate = student.attendances.reduce((acc: any, record) => {
    const dateStr = format(new Date(record.date), 'yyyy-MM-dd');
    if (!acc[dateStr]) {
      acc[dateStr] = [];
    }
    acc[dateStr].push(record);
    return acc;
  }, {});

  const statusStyles: Record<string, { bg: string; badge: string; label: string }> = {
    PRESENT: { bg: 'bg-green-50', badge: 'bg-green-100 text-green-800', label: 'Present' },
    ABSENT: { bg: 'bg-red-50', badge: 'bg-red-100 text-red-800', label: 'Absent' },
    LATE: { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800', label: 'Late' },
  };

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">My Attendance</h1>
        <p className="text-gray-600">
          View your attendance records and statistics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Attendance Rate</h3>
          <div className="flex items-end">
            <span className="text-3xl font-bold">{attendanceRate}%</span>
          </div>
          <div className="mt-2 bg-gray-200 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full ${attendanceRate > 80 ? 'bg-green-500' : attendanceRate > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${attendanceRate}%` }}
            ></div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Present</h3>
          <div className="flex items-center">
            <CalendarCheck className="h-6 w-6 text-green-500 mr-2" />
            <span className="text-3xl font-bold">{presentCount}</span>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Absent</h3>
          <div className="flex items-center">
            <CalendarX className="h-6 w-6 text-red-500 mr-2" />
            <span className="text-3xl font-bold">{absentCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Late</h3>
          <div className="flex items-center">
            <Clock className="h-6 w-6 text-yellow-500 mr-2" />
            <span className="text-3xl font-bold">{lateCount}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Attendance History</h2>
        </div>
        {Object.keys(attendanceByDate).length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No attendance records found
          </div>
        ) : (
          <div className="divide-y">
            {Object.entries(attendanceByDate).map(([date, records]: [string, any]) => (
              <div key={date} className="p-4">
                <h3 className="font-medium mb-2">{format(new Date(date), 'EEEE, MMMM d, yyyy')}</h3>
                <div className="space-y-2">
                  {records.map((record: any) => {
                    const style = statusStyles[record.status] || statusStyles.PRESENT;
                    return (
                      <div key={record.id} className={`p-3 rounded-md ${style.bg}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{record.lesson.name}</p>
                            <p className="text-sm text-gray-600">{record.lesson.subject.name}</p>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${style.badge}`}>
                            {style.label}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
