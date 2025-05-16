import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Class, Lesson, Prisma, Subject, Teacher } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

type LessonList = Lesson & { subject: Subject } & { class: Class } & {
  teacher: Teacher;
};


const LessonListPage = async ({
  searchParams,
  params,
}: {
  searchParams: { [key: string]: string | undefined };
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return <div>Access Denied: You are not authorized for this school.</div>;
  }

// Fetch data needed for the form dropdowns
const [subjects, teachers, classes] = await Promise.all([
  prisma.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
  prisma.teacher.findMany({
    where: { schoolId },
    include: { subjects: { select: { id: true } } }, // Include subject IDs for filtering
    orderBy: [{ surname: 'asc' }, { name: 'asc' }],
  }),
  prisma.class.findMany({ where: { schoolId }, orderBy: { name: 'asc' } })
]);

const columns = [
  {
    header: "Subject Name",
    accessor: "name",
  },
  {
    header: "Class",
    accessor: "class",
  },
  {
    header: "Teacher",
    accessor: "teacher",
    className: "hidden md:table-cell",
  },
  {
    header: "Day",
    accessor: "day",
    className: "hidden lg:table-cell",
  },
  {
    header: "Start Time",
    accessor: "startTime",
    className: "hidden lg:table-cell",
  },
  {
    header: "End Time",
    accessor: "endTime",
    className: "hidden lg:table-cell",
  },
  ...(authUser.role === "admin"
    ? [
        {
          header: "Actions",
          accessor: "action",
        },
      ]
    : []),
];

const renderRow = (item: LessonList) => (
  <tr
    key={item.id}
    className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
  >
    <td className="flex items-center gap-4 p-4">{item.subject.name}</td>
    <td>{item.class.name}</td>
    <td className="hidden md:table-cell">
      {item.teacher.name + " " + item.teacher.surname}
    </td>
    <td className="hidden lg:table-cell">{item.day}</td>
    <td className="hidden lg:table-cell">
        {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
    </td>
    <td className="hidden lg:table-cell">
        {new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
    </td>
    <td>
      <div className="flex items-center gap-2">
        {authUser.role === "admin" && (
          <>
            <FormContainer
              table="lesson"
              type="update"
              data={item}
              subjects={subjects}
              teachers={teachers}
              classes={classes}
              authUser={authUser}
            />
            <FormContainer table="lesson" type="delete" id={item.id} authUser={authUser} />
          </>
        )}
      </div>
    </td>
  </tr>
);

  const { page, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  const query: Prisma.LessonWhereInput = {
    schoolId: schoolId,
  };

  if (!query.AND) {
      query.AND = [];
  }

  // If the user is a teacher, further restrict the query to their own lessons
  if (authUser.role === 'teacher') {
    const teacherProfile = await prisma.teacher.findUnique({
      where: { authId: authUser.id, schoolId: schoolId },
      select: { id: true }, // Select only the teacher's own ID (from Teacher table)
    });

    if (teacherProfile && teacherProfile.id) {
      if (Array.isArray(query.AND)) { // Type guard
        query.AND.push({
          teacherId: teacherProfile.id, // Filter lessons by this teacher's ID
        });
      }
    } else {
      // Teacher profile not found for this school, or teacher has no ID
      // Ensure no lessons are returned by adding a condition that cannot be met.
      // Assuming lesson IDs are positive integers.
      if (Array.isArray(query.AND)) { // Type guard
         query.AND.push({ id: { equals: -1 } }); 
      }
    }
  }

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "classId":
             if (Array.isArray(query.AND)) {
                 query.AND.push({ classId: parseInt(value) });
             }
            break;
          case "teacherId":
             if (Array.isArray(query.AND)) {
                 query.AND.push({ teacherId: value });
             }
            break;
          case "search":
             if (Array.isArray(query.AND)) {
                 query.AND.push({
                    OR: [
                      { subject: { name: { contains: value, mode: "insensitive" } } },
                      { teacher: { name: { contains: value, mode: "insensitive" } } },
                    ]
                 });
             }
            break;
          default:
            break;
        }
      }
    }
  }

  if (Array.isArray(query.AND) && query.AND.length === 0) {
    delete query.AND;
  }

  const [data, count] = await prisma.$transaction([
    prisma.lesson.findMany({
      where: query,
      include: {
        subject: { select: { name: true, id: true } },
        class: { select: { name: true, id: true } },
        teacher: { select: { name: true, surname: true, id: true } },
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.lesson.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Lessons</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {authUser.role === "admin" && (
              <FormContainer
                table="lesson"
                type="create"
                subjects={subjects}
                teachers={teachers}
                classes={classes}
                authUser={authUser}
              />
            )}
          </div>
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={data} />
      {/* PAGINATION */}
      <Pagination page={p} count={count} />
    </div>
  );
};

export default LessonListPage;
