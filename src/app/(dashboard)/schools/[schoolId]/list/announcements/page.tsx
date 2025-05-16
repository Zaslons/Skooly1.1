import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Announcement, Class, Prisma } from "@prisma/client";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";


type AnnouncementList = Announcement & { class: Class | null };
const AnnouncementListPage = async ({
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
      header: "Class",
      accessor: "class",
    },
    {
      header: "Date",
      accessor: "date",
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
  
  const renderRow = (item: AnnouncementList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
    >
      <td className="flex items-center gap-4 p-4">{item.title}</td>
      <td>{item.class?.name || "School Wide"}</td>
      <td className="hidden md:table-cell">
        {new Intl.DateTimeFormat("en-US").format(new Date(item.createdAt))}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {authUser.role === "admin" && (
            <>
              <FormContainer table="announcement" type="update" data={item} authUser={authUser} />
              <FormContainer table="announcement" type="delete" id={item.id} authUser={authUser} />
            </>
          )}
        </div>
      </td>
    </tr>
  );
  const { page, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  // Base query: filter by schoolId first
  const query: Prisma.AnnouncementWhereInput = {
      schoolId: schoolId,
  };

  // Initialize AND clause for search/other filters
  if (!query.AND) {
      query.AND = [];
  }

  // Handle search parameters
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "search":
            // Add search condition to AND clause
             if (Array.isArray(query.AND)) { // Type guard
                 query.AND.push({ title: { contains: value, mode: "insensitive" } });
             }
            break;
          default:
            break;
        }
      }
    }
  }
  
  // ROLE-BASED FILTERING (within the school)
  if (authUser.role !== 'admin') { // Admins see all announcements for the school
      const roleConditions = {
        teacher: { lessons: { some: { teacherId: authUser.id, schoolId: schoolId } } },
        student: { students: { some: { id: authUser.id, schoolId: schoolId } } },
        parent: { students: { some: { parentId: authUser.id, schoolId: schoolId } } },
      };

      if (Array.isArray(query.AND)) {
          query.AND.push({
              OR: [
                { classId: null }, // Global announcements for the school
                {
                    class: roleConditions[authUser.role as keyof typeof roleConditions] || {}
                },
              ]
          });
      }
  }

  // Remove AND if it's empty (only schoolId filter remains)
  if (Array.isArray(query.AND) && query.AND.length === 0) {
    delete query.AND;
  }

  const [data, count] = await prisma.$transaction([
    prisma.announcement.findMany({
      where: query,
      include: {
        class: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.announcement.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">
          All Announcements
        </h1>
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
              <FormContainer table="announcement" type="create" authUser={authUser} />
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

export default AnnouncementListPage;
