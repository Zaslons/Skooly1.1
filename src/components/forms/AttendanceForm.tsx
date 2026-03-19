"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import { attendanceSchema, AttendanceSchema } from "@/lib/formValidationSchemas";
import { createAttendance, updateAttendance, getAttendanceByLessonAndDate, getStudentsByLesson } from "@/lib/actions";
import { useFormState } from "react-dom";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

const AttendanceForm = ({
  type,
  data,
  onClose,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  onClose: () => void;
  relatedData?: any;
}) => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<{ [key: string]: "PRESENT" | "ABSENT" | "LATE" }>({});

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<AttendanceSchema>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      date: new Date(),
      lessonId: data?.lessonId || relatedData?.lessonId,
      studentAttendance: [],
    }
  });

  const [state, formAction] = useFormState(
    type === "create" ? createAttendance : updateAttendance,
    {
      success: false,
      error: false,
    }
  );

  // Load students for the selected lesson
  useEffect(() => {
    const lessonId = data?.lessonId || relatedData?.lessonId;
    if (!lessonId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Get students in the class
        const studentsData = await getStudentsByLesson(Number(lessonId));
        setStudents(studentsData);

        // If updating, load existing attendance
        if (type === "update" && data?.date) {
          const attendanceData = await getAttendanceByLessonAndDate(
            Number(lessonId),
            new Date(data.date)
          );

          const attendanceMap: { [key: string]: "PRESENT" | "ABSENT" | "LATE" } = {};
          attendanceData.forEach((record: any) => {
            attendanceMap[record.studentId] = record.status || "PRESENT";
          });
          setAttendance(attendanceMap);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [data, relatedData, type]);

  const onSubmit = handleSubmit((formData) => {
    const studentAttendance = Object.entries(attendance).map(([studentId, status]) => ({
      studentId,
      status,
    }));

    formData.studentAttendance = studentAttendance as any;
    
    formAction(formData);
  });

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(
        `Attendance has been ${type === "create" ? "created" : "updated"}!`
      );
      onClose();
      router.refresh();
    } else if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  const handleAttendanceChange = (studentId: string, status: "PRESENT" | "ABSENT" | "LATE") => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  if (loading) {
    return <div className="p-4">Loading students...</div>;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4 md:grid-cols-2 w-full"
    >
      <div className="col-span-1 md:col-span-2 mb-4">
        <h2 className="text-lg font-semibold mb-2">
          {type === "create" ? "Take Attendance" : "Update Attendance"}
        </h2>
        <p className="text-gray-600 mb-4">
          {type === "create"
            ? "Mark attendance for students in this class."
            : "Update attendance records for students."}
        </p>
      </div>

      <div className="col-span-1 md:col-span-2">
        <InputField
          name="date"
          label="Date"
          type="date"
          register={register}
          error={errors.date}
          defaultValue={
            data?.date
              ? new Date(data.date).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0]
          }
        />
      </div>

      <div className="col-span-1 md:col-span-2">
        <label className="block mb-2 text-sm font-medium">
          Student Attendance:
        </label>
        <div className="bg-white rounded-md shadow-sm p-4 max-h-80 overflow-y-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th className="text-left pl-2">Student</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center py-4">
                    No students found for this lesson
                  </td>
                </tr>
              ) : (
                students.map((student: any) => (
                  <tr key={student.id} className="even:bg-gray-50">
                    <td className="py-2 pl-2">{`${student.name} ${student.surname}`}</td>
                    <td className="text-center">
                      <select
                        value={attendance[student.id] || "PRESENT"}
                        onChange={(e) => handleAttendanceChange(student.id, e.target.value as "PRESENT" | "ABSENT" | "LATE")}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                      >
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                        <option value="LATE">Late</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-span-1 md:col-span-2 mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onClose()}
          className="px-4 py-2 mr-2 text-sm border rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {type === "create" ? "Save Attendance" : "Update Attendance"}
        </button>
      </div>
    </form>
  );
};

export default AttendanceForm; 