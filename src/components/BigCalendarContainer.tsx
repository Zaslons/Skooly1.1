import prisma from "@/lib/prisma";
import BigCalendar from "./BigCalender";
import { adjustScheduleToCurrentWeek } from "@/lib/utils";

const BigCalendarContainer = async ({
  type,
  id,
  schoolId
}: {
  type: "teacherId" | "classId";
  id: string | number;
  schoolId: string;
}) => {
  if (!schoolId) {
    console.error("SchoolId is required for BigCalendarContainer.");
    return <div className="p-4">Error: Missing School ID for Calendar</div>;
  }
  
  const dataRes = await prisma.lesson.findMany({
    where: {
      schoolId: schoolId,
      ...(type === "teacherId"
        ? { teacherId: id as string }
        : { classId: id as number }),
    },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true } },
      teacher: { select: { name: true, surname: true } }
    }
  });

  const data = dataRes.map((lesson) => ({
    title: `${lesson.subject.name} (${ type === "teacherId" ? lesson.class.name : lesson.teacher.name + " " + lesson.teacher.surname })`,
    start: lesson.startTime,
    end: lesson.endTime,
    extendedProps: { 
        subject: lesson.subject.name,
        className: lesson.class.name,
        teacher: `${lesson.teacher.name} ${lesson.teacher.surname}`
    }
  }));

  const schedule = adjustScheduleToCurrentWeek(data);

  return (
    <div className="">
      <BigCalendar data={schedule} />
    </div>
  );
};

export default BigCalendarContainer;
