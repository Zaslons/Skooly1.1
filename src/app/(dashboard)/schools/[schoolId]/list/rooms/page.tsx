import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Room, Prisma } from "@prisma/client"; // Room type from Prisma
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions"; // Assuming this is the correct path

// Define the type for items in our list, directly using Prisma's Room for now.
type RoomListItem = Room;

const RoomListPage = async ({
  searchParams,
  params,
}: {
  searchParams: { [key: string]: string | undefined };
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    // Or redirect to login page
    return <div>User not authenticated. Please log in.</div>;
  }

  // Authorization: User must belong to the school or be a system_admin
  if (authUser.schoolId !== schoolId && authUser.role !== 'system_admin') {
    return <div>Access Denied: You are not authorized to view rooms for this school.</div>;
  }

  const columns = [
    {
      header: "Name",
      accessor: "name",
    },
    {
      header: "Type",
      accessor: "type",
      className: "hidden md:table-cell",
    },
    {
      header: "Capacity",
      accessor: "capacity",
      className: "hidden md:table-cell",
    },
    {
      header: "Description",
      accessor: "description",
      className: "hidden lg:table-cell", // Show on larger screens
    },
    // Actions column will be added if user is admin
    ...(authUser.role === "admin" || authUser.role === "system_admin" // Allow system_admin to see actions too
      ? [
          {
            header: "Actions",
            accessor: "action",
          },
        ]
      : []),
  ];

  const renderRow = (item: RoomListItem) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
    >
      <td className="p-4">{item.name}</td>
      <td className="hidden md:table-cell p-4">{item.type || 'N/A'}</td>
      <td className="hidden md:table-cell p-4">{item.capacity || 'N/A'}</td>
      <td className="hidden lg:table-cell p-4">{item.description || 'N/A'}</td>
      {(authUser.role === "admin" || authUser.role === "system_admin") && (
        <td className="p-4">
          <div className="flex items-center gap-2">
            <FormContainer table="room" type="update" data={item} authUser={authUser} />
            <FormContainer table="room" type="delete" id={item.id} authUser={authUser} />
          </div>
        </td>
      )}
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;
  const searchTerm = typeof search === 'string' ? search : undefined;

  const query: Prisma.RoomWhereInput = {
    schoolId: schoolId,
  };

  if (searchTerm) {
    query.name = {
      contains: searchTerm,
      mode: "insensitive",
    };
  }

  const [data, count] = await prisma.$transaction([
    prisma.room.findMany({
      where: query,
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { name: 'asc' } 
    }),
    prisma.room.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="hidden md:block text-xl font-semibold text-gray-700">Manage Rooms</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch placeholder="Search rooms by name..."/>
          <div className="flex items-center gap-4 self-end">
            {/* Placeholder for Filter/Sort buttons if needed in future */}
            {/* <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="Filter" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="Sort" width={14} height={14} />
            </button> */}
            {(authUser.role === "admin" || authUser.role === "system_admin") && (
              <FormContainer
                table="room" // This will tell FormContainer to use a RoomForm
                type="create"
                authUser={authUser}
                // initialData can be passed if needed, e.g., { schoolId: schoolId }
              />
            )}
          </div>
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={data} />
      {/* PAGINATION */}
      {count > ITEM_PER_PAGE && <Pagination page={p} count={count} />}
    </div>
  );
};

export default RoomListPage; 