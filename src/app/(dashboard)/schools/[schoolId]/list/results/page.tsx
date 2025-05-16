import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Prisma } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

type ResultList = {
  id: number;
  title: string;
  studentName: string;
  studentSurname: string;
  teacherName: string;
  teacherSurname: string;
  score: number;
  className: string;
  startTime: Date;
};


const ResultListPage = async ({
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

const columns = [
  {
    header: "Title",
    accessor: "title",
  },
  {
    header: "Student",
    accessor: "student",
  },
  {
    header: "Score",
    accessor: "score",
    className: "hidden md:table-cell",
  },
  {
    header: "Teacher",
    accessor: "teacher",
    className: "hidden md:table-cell",
  },
  {
    header: "Class",
    accessor: "class",
    className: "hidden md:table-cell",
  },
  {
    header: "Date",
    accessor: "date",
    className: "hidden md:table-cell",
  },
  ...(authUser.role === "admin" || authUser.role === "teacher"
    ? [
        {
          header: "Actions",
          accessor: "action",
        },
      ]
    : []),
];

const renderRow = (item: ResultList | null) => {
  if (!item) return null;
  return (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
    >
      <td className="flex items-center gap-4 p-4">{item.title}</td>
      <td>{item.studentName + " " + item.studentSurname}</td>
      <td className="hidden md:table-cell">{item.score}</td>
      <td className="hidden md:table-cell">
        {item.teacherName + " " + item.teacherSurname}
      </td>
      <td className="hidden md:table-cell">{item.className}</td>
      <td className="hidden md:table-cell">
        {new Intl.DateTimeFormat("en-US").format(item.startTime)}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(authUser.role === "admin" || authUser.role === "teacher") && (
            <>
              <FormContainer table="result" type="update" data={item} authUser={authUser} />
              <FormContainer table="result" type="delete" id={item.id} authUser={authUser} />
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

  const { page, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  // Base query starts with schoolId
  const query: Prisma.ResultWhereInput = {
    schoolId: schoolId,
  };

  // Initialize AND clause
  if (!query.AND) {
      query.AND = [];
  }
  
  // Add search parameter filters to AND clause
  const searchFilters: Prisma.ResultWhereInput[] = [];
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "studentId":
            // Add studentId condition to AND clause
            searchFilters.push({ studentId: value });
            break;
          case "search":
            // Add search condition (exam title OR student name) to AND clause
             searchFilters.push({
                OR: [
                  { exam: { title: { contains: value, mode: "insensitive" } } },
                  { assignment: { title: { contains: value, mode: "insensitive" } } }, 
                  { student: { name: { contains: value, mode: "insensitive" } } },
                  { student: { surname: { contains: value, mode: "insensitive" } } } // Also search surname
                ]
             });
            break;
          default:
            break;
        }
      }
    }
  }
  if (searchFilters.length > 0 && Array.isArray(query.AND)) {
      query.AND.push(...searchFilters);
  }

  // Add ROLE-BASED filters to AND clause (if not admin)
  if (authUser.role !== 'admin') {
      let roleFilter: Prisma.ResultWhereInput | null = null;
      switch (authUser.role) {
        case "teacher":
          // Teacher sees results for their lessons (either exam or assignment)
          roleFilter = {
            OR: [
                { exam: { lesson: { teacherId: authUser.id } } },
                { assignment: { lesson: { teacherId: authUser.id } } }
            ]
          };
          break;
        case "student":
           // Student sees their own results
          roleFilter = { studentId: authUser.id };
          break;
        case "parent":
          // Parent sees results for their children
          roleFilter = { student: { parentId: authUser.id } };
          break;
        default:
          break;
      }
      if (roleFilter && Array.isArray(query.AND)) {
          query.AND.push(roleFilter);
      }
  }

  // Remove AND if it's empty
  if (Array.isArray(query.AND) && query.AND.length === 0) {
    delete query.AND;
  }

  const [dataRes, count] = await prisma.$transaction([
    prisma.result.findMany({
      where: query,
      include: {
        student: { select: { name: true, surname: true } },
        exam: {
          include: {
            lesson: {
              select: {
                class: { select: { name: true } },
                teacher: { select: { name: true, surname: true } },
              },
            },
          },
        },
        assignment: {
          include: {
            lesson: {
              select: {
                class: { select: { name: true } },
                teacher: { select: { name: true, surname: true } },
              },
            },
          },
        },
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.result.count({ where: query }),
  ]);

  const data = dataRes.map((item) => {
    const assessment = item.exam || item.assignment;

    if (!assessment || !item.student) return null;

    const isExam = !!item.exam;

    return {
      id: item.id,
      title: assessment.title,
      studentName: item.student.name,
      studentSurname: item.student.surname,
      teacherName: assessment.lesson.teacher.name,
      teacherSurname: assessment.lesson.teacher.surname,
      score: item.score,
      className: assessment.lesson.class.name,
      startTime: isExam && item.exam?.startTime ? item.exam.startTime : (item.assignment?.startDate || new Date()),
      relatedData: {}
    } as ResultList;
  }).filter(Boolean) as ResultList[];

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Results</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {(authUser.role === "admin" || authUser.role === "teacher") && (
              <FormContainer table="result" type="create" authUser={authUser} />
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

export default ResultListPage;
