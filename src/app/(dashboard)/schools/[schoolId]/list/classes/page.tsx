import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Class, Prisma, Teacher, Grade, AcademicYear } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

type ClassList = Class & {
    supervisor: Teacher | null;
    grade: Grade;
    academicYear: AcademicYear | null;
};

const ClassListPage = async ({
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
    header: "Class Name",
    accessor: "name",
  },
  {
    header: "Capacity",
    accessor: "capacity",
    className: "hidden md:table-cell",
  },
  {
    header: "Grade",
    accessor: "grade",
    className: "hidden md:table-cell",
  },
  {
    header: "Academic Year",
    accessor: "academicYear",
    className: "hidden md:table-cell",
  },
  {
    header: "Supervisor",
    accessor: "supervisor",
    className: "hidden md:table-cell",
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

const renderRow = (item: ClassList) => (
  <tr
    key={item.id}
    className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
  >
    <td className="flex items-center gap-4 p-4">{item.name}</td>
    <td className="hidden md:table-cell">{item.capacity}</td>
    <td className="hidden md:table-cell p-4">{item.grade.level}</td>
    <td className="hidden md:table-cell p-4">{item.academicYear?.name || 'N/A'}</td>
    <td className="hidden md:table-cell">
      {item.supervisor ? `${item.supervisor.name} ${item.supervisor.surname}` : "N/A"}
    </td>
    <td>
      <div className="flex items-center gap-2">
        {authUser.role === "admin" && (
          <>
            <FormContainer table="class" type="update" data={item} authUser={authUser} />
            <FormContainer table="class" type="delete" id={item.id} authUser={authUser} />
          </>
        )}
      </div>
    </td>
  </tr>
);

  const { page, action, academicYearId: academicYearIdFromParams, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  const query: Prisma.ClassWhereInput = {
    schoolId: schoolId,
    academicYear: {
      isArchived: false,
    },
  };

  if (!query.AND) {
      query.AND = [];
  }

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "supervisorId":
            if (Array.isArray(query.AND)) {
              query.AND.push({ supervisorId: value });
            }
            break;
          case "search":
            if (Array.isArray(query.AND)) {
              query.AND.push({ name: { contains: value, mode: "insensitive" } });
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
    prisma.class.findMany({
      where: query,
      include: {
        supervisor: true,
        grade: true,
        academicYear: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { name: 'asc' }
    }),
    prisma.class.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Classes</h1>
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
                table="class"
                type="create"
                authUser={authUser}
                initialData={academicYearIdFromParams ? { academicYearId: academicYearIdFromParams } : undefined}
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

export default ClassListPage;
