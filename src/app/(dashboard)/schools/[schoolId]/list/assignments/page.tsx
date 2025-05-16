import FormModal from "@/components/FormModal";
import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import TableSearch from "@/components/TableSearch";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Assignment, Class, Prisma, Subject, Teacher } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import Image from "next/image";
import { getVerifiedAuthUser } from "@/lib/actions";
import { redirect } from 'next/navigation';
import RowFormModalTrigger from "@/components/RowFormModalTrigger";

type AssignmentList = Assignment & {
  lesson: {
    subject: Subject;
    class: Class;
    teacher: Teacher;
  };
};

const AssignmentListPage = async ({
  searchParams,
  params,
}: {
  searchParams: { [key: string]: string | undefined };
  params: { schoolId: string };
}) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    return <p>User not authenticated.</p>;
  }

  if (authUser.schoolId !== schoolId) {
    return <p>Access Denied. You do not have permission to view assignments for this school.</p>;
  }

  let studentAssignmentsOnly = false;
  let studentClassId: number | undefined = undefined;

  if (authUser.role === 'student') {
    const studentProfile = await prisma.student.findUnique({
      where: { authId: authUser.id, schoolId: schoolId },
      select: { classId: true }
    });
    if (studentProfile && studentProfile.classId) {
      studentAssignmentsOnly = true;
      studentClassId = studentProfile.classId;
    }
  }

  const columns = [
    {
      header: "Title",
      accessor: "title",
    },
    {
      header: "Subject Name",
      accessor: "subjectName",
    },
    {
      header: "Class",
      accessor: "className",
    },
    {
      header: "Teacher",
      accessor: "teacherName",
      className: "hidden md:table-cell",
    },
    {
      header: "Due Date",
      accessor: "dueDate",
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
  
  const renderRow = (item: AssignmentList) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
    >
      <td className="p-4">{item.title}</td>
      <td className="hidden md:table-cell">{item.lesson.subject.name}</td>
      <td>{item.lesson.class.name}</td>
      <td className="hidden md:table-cell">
        {item.lesson.teacher.name + " " + item.lesson.teacher.surname}
      </td>
      <td className="hidden md:table-cell">
        {new Intl.DateTimeFormat("en-US").format(new Date(item.dueDate))}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(authUser && (authUser.role === "admin" || authUser.role === "teacher")) && (
            <>
              <RowFormModalTrigger
                table="assignment"
                type="update"
                itemData={item}
                authUser={authUser}
                buttonIcon="/update.png"
              />
              <RowFormModalTrigger
                table="assignment"
                type="delete"
                itemId={item.id}
                authUser={authUser}
                buttonIcon="/delete.png"
              />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const { page, ...queryParams } = searchParams;
  const p = page ? parseInt(page) : 1;

  const query: Prisma.AssignmentWhereInput = {
    schoolId: schoolId,
    ...(studentAssignmentsOnly && studentClassId && {
      lesson: {
        classId: studentClassId
      }
    })
  };

  if (!query.AND) {
      query.AND = [];
  }
  
  const searchFilters: Prisma.AssignmentWhereInput[] = [];
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        switch (key) {
          case "classId":
            searchFilters.push({ lesson: { classId: parseInt(value) } });
            break;
          case "teacherId":
            searchFilters.push({ lesson: { teacherId: value } });
            break;
          case "search":
            searchFilters.push({ 
              OR: [
                { title: { contains: value, mode: "insensitive" } },
                { lesson: { subject: { name: { contains: value, mode: "insensitive" } } } }
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

  if (authUser.role !== 'admin' && authUser.role !== 'teacher' && studentAssignmentsOnly === false) {
  }

  if (Array.isArray(query.AND) && query.AND.length === 0) {
    delete query.AND;
  }

  const [data, count] = await prisma.$transaction([
    prisma.assignment.findMany({
      where: query,
      include: {
        lesson: {
          select: {
            subject: { select: { name: true } },
            teacher: { select: { name: true, surname: true } },
            class: { select: { name: true } },
          },
        },
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
      orderBy: { dueDate: 'desc' }
    }),
    prisma.assignment.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">
          All Assignments
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
            {(authUser.role === "admin" || authUser.role === "teacher") && (
                <FormContainer table="assignment" type="create" authUser={authUser} />
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

export default AssignmentListPage;
