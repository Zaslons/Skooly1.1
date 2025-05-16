import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Grade, Prisma } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";

const GradeListPage = async ({
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
  const isAdmin = authUser.role === 'admin';

const columns = [
  {
    header: "Grade Level",
    accessor: "level",
  },
  ...(isAdmin
    ? [
        {
          header: "Actions",
          accessor: "action",
        },
      ]
    : []),
];

// Render function for each grade row
const renderRow = (item: Grade) => (
  <tr
    key={item.id}
    className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
  >
    <td className="p-4">{item.level}</td>
    {isAdmin && (
        <td>
            <div className="flex items-center gap-2 p-4">
                <FormContainer table="grade" type="update" data={item} authUser={authUser} />
                <FormContainer table="grade" type="delete" id={item.id} authUser={authUser} />
            </div>
        </td>
    )}
  </tr>
);

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  // Base query for grades within the specific school
  const query: Prisma.GradeWhereInput = {
    schoolId: schoolId,
  };

  // Add search filter if provided
  if (search) {
    query.level = {
        contains: search,
        mode: 'insensitive',
    };
  }


  const [data, count] = await prisma.$transaction([
    prisma.grade.findMany({
      where: query,
      orderBy: {
        level: 'asc', // Order grades by level
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.grade.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Grades</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          {/* <TableSearch placeholder="Search by Level..." /> */}
          <div className="flex items-center gap-4 self-end">
             {isAdmin && <FormContainer table="grade" type="create" authUser={authUser} />}
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

export default GradeListPage; 