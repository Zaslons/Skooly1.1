import prisma from "@/lib/prisma";

const StudentAttendanceCard = async ({ id, schoolId }: { id: string; schoolId: string }) => {
  // Ensure schoolId is provided
  if (!schoolId) {
      // Handle error or return loading/default state
      console.error("SchoolId is required for StudentAttendanceCard");
      return (
        <div className="">
          <h1 className="text-xl font-semibold">Error</h1>
          <span className="text-sm text-gray-400">Attendance</span>
        </div>
      );
  }

  const attendance = await prisma.attendance.findMany({
    where: {
      studentId: id,
      schoolId: schoolId,
      date: {
        gte: new Date(new Date().getFullYear(), 0, 1),
      },
    },
  });

  const totalDays = attendance.length;
  const presentDays = attendance.filter((day) => day.present).length;
  const percentage = (presentDays / totalDays) * 100;
  return (
    <div className="">
      <h1 className="text-xl font-semibold">{percentage || "-"}%</h1>
      <span className="text-sm text-gray-400">Attendance</span>
    </div>
  );
};

export default StudentAttendanceCard;
