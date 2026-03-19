import { getServerUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Day } from "@prisma/client";
import { formatDateTimeToTimeString } from "@/lib/utils";

const ORDERED_DAYS: Day[] = [
  Day.MONDAY,
  Day.TUESDAY,
  Day.WEDNESDAY,
  Day.THURSDAY,
  Day.FRIDAY,
  Day.SATURDAY,
  Day.SUNDAY,
];

export default async function MySchedulePage({
  params,
}: {
  params: { schoolId: string };
}) {
  const { schoolId } = params;
  const authUser = await getServerUser();

  if (!authUser) {
    redirect(`/sign-in?redirect=/schools/${schoolId}/student/my-schedule`);
  }

  if (authUser.role !== "student") {
    return (
      <div className="p-4 text-red-600">
        Access Denied: This page is for students only.
      </div>
    );
  }

  if (authUser.schoolId !== schoolId) {
    return (
      <div className="p-4 text-red-600">
        Access Denied: You are not authorized for this school.
      </div>
    );
  }

  const student = await prisma.student.findFirst({
    where: {
      schoolId,
      OR: [
        ...(authUser.profileId ? [{ id: authUser.profileId }] : []),
        { authId: authUser.id },
      ],
    },
    select: { id: true, classId: true, name: true, surname: true },
  });

  if (!student) {
    return (
      <div className="p-4 text-gray-600">
        Student profile not found. Please contact your school administrator.
      </div>
    );
  }

  if (!student.classId) {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
        <h2 className="text-lg font-semibold mb-2">No schedule available</h2>
        <p>
          You are not assigned to a class yet. Please contact your school
          administrator to get enrolled.
        </p>
      </div>
    );
  }

  const lessons = await prisma.lesson.findMany({
    where: { classId: student.classId, schoolId },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { name: true, surname: true } },
      room: { select: { name: true } },
    },
    orderBy: [{ day: "asc" }, { startTime: "asc" }],
  });

  if (lessons.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
        <h2 className="text-lg font-semibold mb-2">No schedule available</h2>
        <p>
          Your class does not have any lessons scheduled yet. Check back later
          or contact your teacher.
        </p>
      </div>
    );
  }

  const lessonsByDay: Record<Day, typeof lessons> = {
    [Day.MONDAY]: [],
    [Day.TUESDAY]: [],
    [Day.WEDNESDAY]: [],
    [Day.THURSDAY]: [],
    [Day.FRIDAY]: [],
    [Day.SATURDAY]: [],
    [Day.SUNDAY]: [],
  };

  for (const lesson of lessons) {
    lessonsByDay[lesson.day].push(lesson);
  }

  for (const day of ORDERED_DAYS) {
    lessonsByDay[day].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  const daysWithLessons = ORDERED_DAYS.filter(
    (day) => lessonsByDay[day].length > 0
  );

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">
        My Weekly Schedule
      </h1>

      {/* Mobile: rows per day */}
      <div className="block md:hidden space-y-6">
        {daysWithLessons.map((day) => (
          <div key={day} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
            <h2 className="px-4 py-3 bg-indigo-50 text-indigo-800 font-medium capitalize">
              {day.toLowerCase()}
            </h2>
            <div className="divide-y divide-gray-100">
              {lessonsByDay[day].map((lesson) => (
                <div key={lesson.id} className="p-4">
                  <h3 className="font-semibold text-gray-800">
                    {lesson.subject.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {lesson.teacher.name} {lesson.teacher.surname}
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatDateTimeToTimeString(lesson.startTime)} –{" "}
                    {formatDateTimeToTimeString(lesson.endTime)}
                    {lesson.room && (
                      <span className="ml-2">• Room {lesson.room.name}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: days as columns */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr>
              <th className="w-24 p-3 text-left text-sm font-medium text-gray-500 border-b border-gray-200 bg-gray-50">
                Time
              </th>
              {daysWithLessons.map((day) => (
                <th
                  key={day}
                  className="p-3 text-left text-sm font-medium text-indigo-700 border-b border-gray-200 bg-indigo-50/50 min-w-[180px]"
                >
                  {day.charAt(0) + day.slice(1).toLowerCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const allStartTimes = new Set<string>();
              for (const day of daysWithLessons) {
                for (const lesson of lessonsByDay[day]) {
                  allStartTimes.add(formatDateTimeToTimeString(lesson.startTime));
                }
              }
              const sortedTimes = Array.from(allStartTimes).sort(
                (a, b) => {
                  const [ha, ma] = a.split(":").map(Number);
                  const [hb, mb] = b.split(":").map(Number);
                  return ha * 60 + ma - (hb * 60 + mb);
                }
              );

              return sortedTimes.map((timeKey) => (
                <tr key={timeKey} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="p-3 text-sm text-gray-600 font-medium bg-gray-50/50">
                    {timeKey}
                  </td>
                  {daysWithLessons.map((day) => {
                    const lesson = lessonsByDay[day].find(
                      (l) =>
                        formatDateTimeToTimeString(l.startTime) === timeKey
                    );
                    return (
                      <td key={day} className="p-3 align-top">
                        {lesson ? (
                          <div className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
                            <p className="font-semibold text-gray-800">
                              {lesson.subject.name}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {lesson.teacher.name} {lesson.teacher.surname}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDateTimeToTimeString(lesson.startTime)} –{" "}
                              {formatDateTimeToTimeString(lesson.endTime)}
                            </p>
                            {lesson.room && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                Room {lesson.room.name}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
