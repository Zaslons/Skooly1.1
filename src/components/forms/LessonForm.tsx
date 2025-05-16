"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import { lessonSchema, LessonSchema } from "@/lib/formValidationSchemas";
import { createLesson, updateLesson, getTeacherAvailabilityForDay } from "@/lib/actions";
import { useFormState } from "react-dom";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { TeacherAvailability, Day } from "@prisma/client";
import { formatDateTimeToTimeString, cn } from "@/lib/utils";

// Define a more specific type for teachers coming from relatedData
type TeacherWithSubjects = {
  id: string;
  name: string;
  surname: string;
  subjects: { id: number }[];
};

// Update props to accept onClose instead of setOpen
interface LessonFormProps {
  type: "create" | "update";
  data?: any; // Consider defining a more specific type for lesson data
  relatedData?: {
    subjects: any[];
    classes: any[];
    teachers: TeacherWithSubjects[];
    rooms: any[];
    schoolId: string;
  };
  onClose: () => void; // Expect onClose function
}

// Helper function to format Date to YYYY-MM-DDTHH:mm string
const formatDateForInput = (date: Date | string | undefined): string => {
  if (!date) return "";
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return ""; // Invalid date

    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const dayNum = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${dayNum}T${hours}:${minutes}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return "";
  }
};

const LessonForm = ({
  type,
  data,
  relatedData,
  onClose, // Use onClose from props
}: LessonFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues
  } = useForm<LessonSchema>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      name: data?.name ?? "",
      day: data?.day ?? Day.MONDAY,
      startTime: data?.startTime ? new Date(data.startTime) : undefined,
      endTime: data?.endTime ? new Date(data.endTime) : undefined,
      subjectId: data?.subject?.id ?? data?.subjectId ?? "",
      classId: data?.class?.id ?? data?.classId ?? "",
      teacherId: data?.teacher?.id ?? data?.teacherId ?? "",
      roomId: data?.room?.id ?? data?.roomId ?? "",
      id: data?.id ?? undefined,
    }
  });

  const [formActionState, formAction] = useFormState(
    type === "create" ? createLesson : updateLesson,
    {
      success: false,
      error: false,
      message: "",
    }
  );

  const onSubmit = handleSubmit((formData) => {
    console.log("Lesson form data:", formData);
    formAction(formData);
  });

  const router = useRouter();

  const { subjects = [], classes = [], teachers = [], rooms = [], schoolId = "" } = relatedData || {};
  const [filteredTeachers, setFilteredTeachers] = useState<TeacherWithSubjects[]>(teachers || []);

  // NEW: State for teacher availability
  const [teacherAvailabilitySlots, setTeacherAvailabilitySlots] = useState<TeacherAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [lessonTimeConflict, setLessonTimeConflict] = useState<string | null>(null);

  const selectedSubjectId = watch("subjectId");
  const selectedTeacherId = watch("teacherId");
  const selectedDay = watch("day");
  const lessonStartTime = watch("startTime");
  const lessonEndTime = watch("endTime");

  useEffect(() => {
    if (formActionState.success) {
      toast.success(formActionState.message || `Lesson has been ${type === "create" ? "created" : "updated"}!`);
      onClose(); // Call onClose received from props
      router.refresh();
    }
    if(formActionState.error && formActionState.message){
       toast.error(formActionState.message);
    }
  }, [formActionState, router, type, onClose]);

  useEffect(() => {
    const subjectIdNumber = selectedSubjectId ? parseInt(selectedSubjectId.toString(), 10) : null;

    if (subjectIdNumber && !isNaN(subjectIdNumber)) {
      // Filter teachers based on the selected subject ID
      const newFilteredTeachers = teachers.filter((teacher: TeacherWithSubjects) =>
        teacher.subjects.some(subject => subject.id === subjectIdNumber)
      );
      setFilteredTeachers(newFilteredTeachers);

      // Check if the current teacher selection is still valid
      const currentTeacherId = getValues("teacherId");
      if (currentTeacherId && !newFilteredTeachers.some((t: TeacherWithSubjects) => t.id === currentTeacherId)) {
        setValue("teacherId", ""); // Reset teacher if not valid for the selected subject
        setTeacherAvailabilitySlots([]); // Clear availability if teacher changes
      }

    } else {
      // If no subject is selected (or selection is invalid), show all teachers
      setFilteredTeachers(teachers || []);
      setTeacherAvailabilitySlots([]); // Clear availability if subject is cleared
    }
  }, [selectedSubjectId, teachers, setValue, getValues]);

  // NEW: Fetch teacher availability
  useEffect(() => {
    if (selectedTeacherId && selectedDay && schoolId) {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      setTeacherAvailabilitySlots([]); // Clear previous slots

      getTeacherAvailabilityForDay(selectedTeacherId, selectedDay as Day, schoolId)
        .then(slots => {
          setTeacherAvailabilitySlots(slots);
          if (slots.length === 0 && !availabilityError) {
            setAvailabilityError("Selected teacher has no availability set for this day.");
          }
        })
        .catch(err => {
          console.error("Failed to fetch teacher availability:", err);
          setAvailabilityError("Could not load teacher availability.");
        })
        .finally(() => {
          setAvailabilityLoading(false);
        });
    } else {
      setTeacherAvailabilitySlots([]); // Clear if no teacher/day/schoolId
      setAvailabilityError(null);
    }
  }, [selectedTeacherId, selectedDay, schoolId, availabilityError]);

  // NEW: Check for lesson time conflicts with availability
  useEffect(() => {
    setLessonTimeConflict(null);
    if (!lessonStartTime || !lessonEndTime || !selectedDay) {
      return;
    }

    const lessonStart = new Date(lessonStartTime);
    const lessonEnd = new Date(lessonEndTime);

    if (lessonEnd <= lessonStart) {
        setLessonTimeConflict("Lesson end time must be after start time.");
        return;
    }

    // Default working hours and weekend check
    const DEFAULT_WORK_START_HOUR = 8;
    const DEFAULT_WORK_END_HOUR = 17;
    const currentDay = selectedDay as Day; // selectedDay is from form, type Day

    if (currentDay === Day.SATURDAY || currentDay === Day.SUNDAY) {
        setLessonTimeConflict(`Lessons are generally not scheduled on ${currentDay.toLowerCase()}s.`);
        return;
    }

    const lessonStartHour = lessonStart.getHours();
    const lessonEndHour = lessonEnd.getHours();
    const lessonEndMinutes = lessonEnd.getMinutes();

    const isWithinDefaultHours = 
        lessonStartHour >= DEFAULT_WORK_START_HOUR &&
        (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0));

    if (!isWithinDefaultHours) {
        setLessonTimeConflict(`Warning: Lesson time is outside default working hours (${DEFAULT_WORK_START_HOUR}:00 - ${DEFAULT_WORK_END_HOUR}:00).`);
        // Do not return yet, still check for explicit unavailable blocks
    }

    // Check for overlap with any explicitly UNAVAILABLE slots
    if (Array.isArray(teacherAvailabilitySlots) && teacherAvailabilitySlots.length > 0) {
        const overlapsWithUnavailable = teacherAvailabilitySlots.some(slot => {
            if (slot.isAvailable) return false; // Only consider unavailable slots for direct conflict
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);
            return lessonStart < slotEnd && lessonEnd > slotStart; // Overlap condition
        });

        if (overlapsWithUnavailable) {
            setLessonTimeConflict("Warning: Lesson time conflicts with a period the teacher has marked as UNAVAILABLE.");
            return; // This is a hard conflict
        }
    }
    
    // If it passed unavailable check, and was outside default hours, that warning remains.
    // If it was within default hours and no conflict with unavailable, then no conflict message.

  }, [lessonStartTime, lessonEndTime, selectedDay, teacherAvailabilitySlots]);

  return (
    <form className="flex flex-col gap-6 p-1" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold text-gray-800">
        {type === "create" ? "Create a new lesson" : "Update the lesson"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Lesson name"
          name="name"
          defaultValue={data?.name}
          register={register}
          error={errors?.name}
        />
        
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <label className="text-xs font-medium text-gray-600">Day</label>
          <select
            className="ring-1.5 ring-gray-300 p-2 rounded-md text-sm w-full focus:outline-none focus:ring-indigo-500 border-gray-300"
            {...register("day")}
          >
            {Object.values(Day).map(dayVal => (
              <option key={dayVal} value={dayVal}>{dayVal.charAt(0) + dayVal.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {errors.day?.message && (
            <p className="text-xs text-red-500 mt-1">{errors.day.message.toString()}</p>
          )}
        </div>
        
        <InputField
          label="Start Time"
          name="startTime"
          register={register}
          error={errors?.startTime}
          type="datetime-local"
        />
        
        <InputField
          label="End Time"
          name="endTime"
          register={register}
          error={errors?.endTime}
          type="datetime-local"
        />
        
        {data && (
          <InputField
            label="Id"
            name="id"
            defaultValue={data?.id}
            register={register}
            error={errors?.id}
            hidden
          />
        )}
        
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("subjectId")}
          >
            <option value="">Select Subject</option>
            {subjects.map((subject: { id: number; name: string }) => (
              <option value={subject.id} key={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">
              {errors.subjectId.message.toString()}
            </p>
          )}
        </div>
        
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("classId")}
          >
            <option value="">Select Class</option>
            {classes.map((classItem: { id: number; name: string }) => (
              <option value={classItem.id} key={classItem.id}>
                {classItem.name}
              </option>
            ))}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">
              {errors.classId.message.toString()}
            </p>
          )}
        </div>
        
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <label className="text-xs font-medium text-gray-600">Teacher</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full focus:ring-lamaPurple focus:border-lamaPurple outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            {...register("teacherId")}
            defaultValue={data?.teacher?.id ?? data?.teacherId}
            disabled={!selectedSubjectId}
          >
            <option value="">Select Teacher</option>
            {filteredTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name} {teacher.surname}
              </option>
            ))}
          </select>
          {errors.teacherId && (
            <p className="text-xs text-red-500">{errors.teacherId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-auto">
          <label className="text-xs font-medium text-gray-600">Room (Optional)</label>
          <select
            {...register("roomId")}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full focus:ring-lamaPurple focus:border-lamaPurple outline-none"
            defaultValue={data?.room?.id ?? data?.roomId}
          >
            <option value="">Select Room (Optional)</option>
            {rooms.map((room: { id: number; name: string; type?: string | null; capacity?: number | null }) => (
              <option key={room.id} value={room.id}>
                {room.name}{room.type ? ` (${room.type})` : ""}{room.capacity ? ` - Cap: ${room.capacity}` : ""}
              </option>
            ))}
          </select>
          {errors.roomId && (
            <p className="text-xs text-red-500">{errors.roomId.message}</p>
          )}
        </div>
      </div>
      
      {/* NEW: Display Teacher Availability & Conflicts */}
      {selectedTeacherId && selectedDay && (
        <div className="mt-2 p-3 border border-gray-200 rounded-md bg-gray-50 text-xs">
          <h3 className="font-semibold text-gray-700 mb-1.5">
            {teachers.find(t=>t.id === selectedTeacherId)?.name}'s Availability for {selectedDay.toLowerCase()}:
          </h3>
          {availabilityLoading && <p className="text-gray-500 italic">Loading availability...</p>}
          {availabilityError && <p className="text-red-500">{availabilityError}</p>}
          {!availabilityLoading && !availabilityError && Array.isArray(teacherAvailabilitySlots) && teacherAvailabilitySlots.length > 0 && (
            <ul className="space-y-1">
              {teacherAvailabilitySlots.map(slot => (
                <li key={slot.id} className={cn(
                    "px-2 py-1 rounded text-white text-[11px] inline-block mr-1 mb-1",
                    slot.isAvailable ? "bg-green-500" : "bg-red-500"
                )}>
                  {formatDateTimeToTimeString(slot.startTime)} - {formatDateTimeToTimeString(slot.endTime)}
                  {slot.notes && <span className="italic text-gray-200"> ({slot.notes})</span>}
                </li>
              ))}
            </ul>
          )}
          {!availabilityLoading && !availabilityError && Array.isArray(teacherAvailabilitySlots) && teacherAvailabilitySlots.length === 0 && (
             <p className="text-gray-500">No specific availability slots found for this day.</p>
          )}
        </div>
      )}

      {lessonTimeConflict && (
        <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-md">{lessonTimeConflict}</p>
      )}

      <div className="flex justify-end gap-3 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
          disabled={formActionState.success || availabilityLoading}
        >
          {type === "create" ? "Create Lesson" : "Update Lesson"}
        </button>
      </div>
    </form>
  );
};

export default LessonForm; 