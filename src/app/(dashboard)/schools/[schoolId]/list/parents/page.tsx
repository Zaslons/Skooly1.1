import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Parent, Prisma, Student } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

type ParentList = Parent & { students: Student[] };

const ParentListPage = async ({
  searchParams,
  params,
}: {
  searchParams: { [key: string]: string | undefined };
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <div>User not authenticated. Please sign in.</div>;
  }

  if (authUser.schoolId !== schoolId) {
    return (
      <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p>You are not authorized to view parents for this school.</p>
      </div>
    );
  }

const columns = [
  {
    header: "Info",
    accessor: "info",
  },
  {
    header: "Student Names",
    accessor: "students",
    className: "hidden md:table-cell",
  },
  {
    header: "Phone",
    accessor: "phone",
    className: "hidden lg:table-cell",
  },
  {
    header: "Address",
    accessor: "address",
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

const renderRow = (item: ParentList) => (
  <tr
    key={item.id}
    className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
  >
    <td className="flex items-center gap-4 p-4">
      <div className="flex flex-col">
        <h3 className="font-semibold">{item.name}</h3>
        <p className="text-xs text-gray-500">{item?.email}</p>
      </div>
    </td>
    <td className="hidden md:table-cell">
      {item.students.map((student) => student.name).join(",")}
    </td>
    <td className="hidden md:table-cell">{item.phone}</td>
    <td className="hidden md:table-cell">{item.address}</td>
    <td>
      <div className="flex items-center gap-2">
        {authUser.role === "admin" && (
          <>
            <FormContainer table="parent" type="update" data={item} authUser={authUser} />
            <FormContainer table="parent" type="delete" id={item.id} authUser={authUser} />
          </>
        )}
      </div>
    </td>
  </tr>
);

  const { page, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  const query: Prisma.ParentWhereInput = {
    schoolId: schoolId,
  };

  // Initialize AND clause if it doesn't exist
  if (!query.AND) {
      query.AND = [];
  }

  // If the user is a teacher, further restrict the query to parents of their students
  if (authUser.role === 'teacher') {
    const teacherProfile = await prisma.teacher.findUnique({
      where: { authId: authUser.id, schoolId: schoolId }, // Use schoolId from params
      select: { id: true },
    });

    if (teacherProfile) {
      const lessonsTaughtByTeacher = await prisma.lesson.findMany({
        where: {
          teacherId: teacherProfile.id,
          schoolId: schoolId, // Use schoolId from params
        },
        select: { classId: true },
        distinct: ['classId'],
      });

      const classIdsTaughtByTeacher = lessonsTaughtByTeacher.map(lesson => lesson.classId).filter(id => id !== null) as number[];

      if (classIdsTaughtByTeacher.length > 0) {
        const studentsOfTeacher = await prisma.student.findMany({
          where: {
            classId: { in: classIdsTaughtByTeacher },
            schoolId: schoolId, // Use schoolId from params
          },
          select: { parentId: true },
        });

        const parentIdsOfTeacherStudents = Array.from(new Set(studentsOfTeacher.map(student => student.parentId).filter(id => id !== null))) as string[];
        
        if (Array.isArray(query.AND)) {
            query.AND.push({
                id: { 
                    in: parentIdsOfTeacherStudents.length > 0 ? parentIdsOfTeacherStudents : ["nonexistent-parent-id"] 
                },
            });
        }
      } else {
        // Teacher teaches no classes, so they see no parents
        if (Array.isArray(query.AND)) {
            query.AND.push({ id: { equals: "nonexistent-parent-id" } });
        }
      }
    } else {
      // Teacher profile not found for this school
      if (Array.isArray(query.AND)) {
        query.AND.push({ id: { equals: "nonexistent-parent-id" } });
      }
    }
  }

  // Process other query parameters (like search)
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "search":
            if (!query.OR) query.OR = [];
            query.OR.push({ name: { contains: value, mode: "insensitive" } });
            query.OR.push({ surname: { contains: value, mode: "insensitive" } });
            query.OR.push({ email: { contains: value, mode: "insensitive" } });
            break;
          default:
            break;
        }
      }
    }
  }

  const [data, count] = await prisma.$transaction([
    prisma.parent.findMany({
      where: query,
      include: {
        students: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.parent.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Parents</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {authUser.role === "admin" && <FormContainer table="parent" type="create" authUser={authUser} />}
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

export default ParentListPage;
