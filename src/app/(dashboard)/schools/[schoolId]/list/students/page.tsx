import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";

import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Class, Prisma, Student, Grade } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

// import { auth } from "@clerk/nextjs/server"; // Removed Clerk
import { getVerifiedAuthUser } from "@/lib/actions"; // Added custom auth
import { redirect } from "next/navigation"; // Added redirect

type StudentList = Student & {
    class: Class;
    grade: Grade;
};

const StudentListPage = async ({
  searchParams,
  params,
}: {
  searchParams: { [key: string]: string | undefined };
  params: { schoolId: string };
}) => {
  // const { sessionClaims } = auth(); // Removed Clerk
  // const role = (sessionClaims?.metadata as { role?: string })?.role; // Removed Clerk
  // const { schoolId } = params; // Will use routeSchoolId from destructuring

  const authUser = await getVerifiedAuthUser();
  const { schoolId: routeSchoolId } = params; // Use routeSchoolId for clarity

  if (!authUser) {
    redirect('/sign-in?message=Please sign in to view this page.');
  }

  if (authUser.schoolId !== routeSchoolId) {
    return (
      <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p>You do not have permission to view students for this school.</p>
      </div>
    );
  }

  const userRole = authUser.role; // Use role from our authUser

  const columns = [
    {
      header: "Info",
      accessor: "info",
    },
    {
      header: "Student ID",
      accessor: "studentId",
      className: "hidden md:table-cell",
    },
    {
      header: "Grade",
      accessor: "grade",
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
    ...(userRole === "admin"
      ? [
          {
            header: "Actions",
            accessor: "action",
          },
        ]
      : []),
  ];

  const renderRow = (item: StudentList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
    >
      <td className="flex items-center gap-4 p-4">
        <Image
          src={item.img || "/noAvatar.png"}
          alt=""
          width={40}
          height={40}
          className="md:hidden xl:block w-10 h-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-gray-500">{item.class.name}</p>
        </div>
      </td>
      <td className="hidden md:table-cell">{item.username}</td>
      <td className="hidden md:table-cell p-4">{item.grade.level}</td>
      <td className="hidden lg:table-cell">{item.phone ?? 'N/A'}</td>
      <td className="hidden lg:table-cell">{item.address}</td>
      <td>
        <div className="flex items-center gap-2">
          <Link href={`/schools/${routeSchoolId}/list/students/${item.id}`}>
            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
              <Image src="/view.png" alt="" width={16} height={16} />
            </button>
          </Link>
          {userRole === "admin" && (
            <>
              <FormContainer table="student" type="update" id={item.id} data={item} authUser={authUser} />
              <FormContainer table="student" type="delete" id={item.id} authUser={authUser} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const { page, ...queryParams } = searchParams;

  const p = page ? parseInt(page) : 1;

  // URL PARAMS CONDITION

  // Start with the mandatory schoolId filter
  const query: Prisma.StudentWhereInput = {
    schoolId: routeSchoolId,
  };

  // Initialize AND clause if it doesn't exist
  if (!query.AND) {
      query.AND = [];
  }

  // If the user is a teacher, further restrict the query to their students
  if (userRole === 'teacher') {
    const teacherProfile = await prisma.teacher.findUnique({
      where: { authId: authUser.id, schoolId: routeSchoolId },
      select: { id: true },
    });

    if (teacherProfile) {
      const lessonsTaughtByTeacher = await prisma.lesson.findMany({
        where: {
          teacherId: teacherProfile.id,
          schoolId: routeSchoolId,
        },
        select: { classId: true },
        distinct: ['classId'],
      });

      const classIdsTaughtByTeacher = lessonsTaughtByTeacher.map(lesson => lesson.classId).filter(id => id !== null) as number[]; // filter out null classIds and assert as number[]

      if (Array.isArray(query.AND)) { // Type guard
        query.AND.push({
          classId: {
            in: classIdsTaughtByTeacher.length > 0 ? classIdsTaughtByTeacher : [-1], // Use [-1] to return no students if teacher teaches no classes, preventing error with empty `in` array
          },
        });
      }
    } else {
      // Teacher profile not found for this school, effectively meaning they have no students in this school
      // Or, if preferred, redirect or show an error message.
      // For now, ensure no students are returned.
      if (Array.isArray(query.AND)) { // Type guard
         query.AND.push({ id: { equals: "nonexistent" } }); // No student will match this
      }
    }
  }

  // Process other query parameters
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "teacherId":
             // Add teacherId condition to AND clause
             if (Array.isArray(query.AND)) { // Type guard
                query.AND.push({
                    class: {
                        lessons: {
                            some: {
                                teacherId: value,
                            },
                        },
                    }
                });
             }
            break;
          case "search":
            // Add search condition to AND clause
            if (Array.isArray(query.AND)) { // Type guard
                 query.AND.push({ name: { contains: value, mode: "insensitive" } });
            }
            break;
          default:
            // Ignore other params or handle them as needed
            break;
        }
      }
    }
  }

  // Remove AND if it's empty
  if (Array.isArray(query.AND) && query.AND.length === 0) {
    delete query.AND;
  }

  const [data, count] = await prisma.$transaction([
    prisma.student.findMany({
      where: query,
      include: {
        class: true,
        grade: true,
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.student.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Students</h1>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <TableSearch />
          <div className="flex items-center gap-4 self-end">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/filter.png" alt="" width={14} height={14} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              <Image src="/sort.png" alt="" width={14} height={14} />
            </button>
            {userRole === "admin" && (
              // <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
              //   <Image src="/plus.png" alt="" width={14} height={14} />
              // </button>
              <FormContainer table="student" type="create" authUser={authUser} />
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

export default StudentListPage;
