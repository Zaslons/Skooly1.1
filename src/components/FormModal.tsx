"use client";

import {
  deleteClass,
  deleteExam,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteLesson,
  deleteAssignment,
  deleteParent,
  deleteResult,
  deleteAnnouncement,
  deleteEvent,
  deleteAttendance,
  deleteGrade,
  deleteRoom,
} from "@/lib/actions";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { toast } from "react-toastify";
import { FormContainerProps } from "./FormContainer";

// Define ActionState matching the one in actions.ts
type ActionState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const deleteActionMap: { 
  [key: string]: (currentState: ActionState, formData: FormData) => Promise<ActionState>; 
} = {
  subject: deleteSubject,
  class: deleteClass,
  teacher: deleteTeacher,
  student: deleteStudent,
  exam: deleteExam,
  parent: deleteParent,
  lesson: deleteLesson,
  assignment: deleteAssignment,
  result: deleteResult,
  event: deleteEvent,
  announcement: deleteAnnouncement,
  attendance: deleteAttendance,
  grade: deleteGrade,
  room: deleteRoom,
};

// USE LAZY LOADING

// import TeacherForm from "./forms/TeacherForm";
// import StudentForm from "./forms/StudentForm";

const TeacherForm = dynamic(() => import("./forms/TeacherForm"), {
  loading: () => <h1>Loading...</h1>,
});
const StudentForm = dynamic(() => import("./forms/StudentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const SubjectForm = dynamic(() => import("./forms/SubjectForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ClassForm = dynamic(() => import("./forms/ClassForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ExamForm = dynamic(() => import("./forms/ExamForm"), {
  loading: () => <h1>Loading...</h1>,
});
// New forms
const LessonForm = dynamic(() => import("./forms/LessonForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AssignmentForm = dynamic(() => import("./forms/AssignmentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ParentForm = dynamic(() => import("./forms/ParentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ResultForm = dynamic(() => import("./forms/ResultForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AnnouncementForm = dynamic(() => import("./forms/AnnouncementForm"), {
  loading: () => <h1>Loading...</h1>,
});
const EventForm = dynamic(() => import("./forms/EventForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AttendanceForm = dynamic(() => import("./forms/AttendanceForm"), {
  loading: () => <h1>Loading...</h1>,
});
const GradeForm = dynamic(() => import("./forms/GradeForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AdminForm = dynamic(() => import("./forms/AdminForm"), {
  loading: () => <h1>Loading...</h1>,
});
const RoomForm = dynamic(() => import("./forms/RoomForm"), {
  loading: () => <h1>Loading...</h1>,
});

const forms: {
  [key: string]: (
    onClose: () => void,
    type: "create" | "update",
    data?: any,
    relatedData?: any,
    authUser?: any
  ) => JSX.Element;
} = {
  subject: (onClose, type, data, relatedData) => (
    <SubjectForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  class: (onClose, type, data, relatedData) => (
    <ClassForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  teacher: (onClose, type, data, relatedData) => (
    <TeacherForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  student: (onClose, type, data, relatedData) => (
    <StudentForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  exam: (onClose, type, data, relatedData) => (
    <ExamForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  // New form mappings
  lesson: (onClose, type, data, relatedData) => (
    <LessonForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  assignment: (onClose, type, data, relatedData) => (
    <AssignmentForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  parent: (onClose, type, data) => (
    <ParentForm
      type={type}
      data={data}
      onClose={onClose}
    />
  ),
  result: (onClose, type, data, relatedData) => (
    <ResultForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  announcement: (onClose, type, data, relatedData) => (
    <AnnouncementForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  event: (onClose, type, data, relatedData) => (
    <EventForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  attendance: (onClose, type, data, relatedData) => (
    <AttendanceForm
      type={type}
      data={data}
      onClose={onClose}
      relatedData={relatedData}
    />
  ),
  grade: (onClose, type, data) => (
    <GradeForm
      type={type}
      data={data}
      onClose={onClose}
    />
  ),
  admin: (onClose, type, data, relatedData) => (
    <AdminForm 
      type={type} 
      data={data} 
      onClose={onClose} 
    />
  ),
  room: (onClose, type, data, relatedData, authUser) => (
    <RoomForm
      type={type}
      data={data}
      onClose={onClose}
      authUser={authUser}
    />
  ),
};

const FormModal = ({
  table,
  type,
  data,
  id,
  relatedData,
  authUser,
  isOpen,
  onClose,
  children,
}: FormContainerProps & { 
  relatedData?: any; 
  isOpen: boolean; 
  onClose: () => void; 
  children?: React.ReactNode;
  authUser?: any;
}) => {
  console.log("[FormModal] Props received - type:", type, "table:", table, "data:", JSON.stringify(data, null, 2));

  const size = type === "create" ? "w-8 h-8" : "w-7 h-7";
  const bgColor =
    type === "create"
      ? "bg-lamaYellow"
      : type === "update"
      ? "bg-lamaSky"
      : "bg-lamaPurple";

  const [deleteState, deleteFormAction] = useFormState(deleteActionMap[table], {
    success: false,
    error: false,
    message: "",
  });
  const router = useRouter();

  useEffect(() => {
    if (deleteState.success) {
      toast(`${table} has been deleted!`);
      onClose();
      router.refresh();
    }
    if (deleteState.error && deleteState.message) {
      toast.error(deleteState.message);
    }
  }, [deleteState, router, table, onClose]);

  const handleDeleteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("id", id as string);
    deleteFormAction(formData);
  };

  if (!isOpen) {
    return null;
  }

  const renderContent = () => {
    if (children) {
      return children;
    }

    const FormComponent = forms[table];
    if (type === "delete" && id) {
      return (
        <form onSubmit={handleDeleteSubmit} className="p-4 flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <span className="text-center font-medium">
            All data will be lost. Are you sure you want to delete this {table}?
          </span>
          <button className="bg-red-700 text-white py-2 px-4 rounded-md border-none w-max self-center">
            Delete
          </button>
          {deleteState.error && (
             <span className="text-red-500 text-center text-sm mt-2">{deleteState.message || 'Deletion failed!'}</span>
           )}
        </form>
      );
    } else if (type === "create" || type === "update") {
      return FormComponent(onClose, type, data, relatedData, authUser);
    } else {
      return "Form type not recognized!";
    }
  };

  return (
    <div className="modal fixed w-screen h-screen top-0 left-0 bg-black/50 flex items-center justify-center z-50">
      <div className="modalContainer bg-white rounded-md p-10 relative w-full max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <button className="absolute top-2 right-2" onClick={onClose}>
          <Image src="/close.png" alt="" width={12} height={12} />
        </button>
        {renderContent()}
      </div>
    </div>
  );
};

export default FormModal;
