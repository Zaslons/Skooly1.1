"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField"; // Assuming InputField can handle type="time"
import { teacherAvailabilitySchema, TeacherAvailabilitySchema } from "@/lib/formValidationSchemas";
import { createTeacherAvailability, updateTeacherAvailability } from "@/lib/actions";
import { useFormState } from "react-dom";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { Day } from "@prisma/client"; // For Day enum

// Props for the form
interface TeacherAvailabilityFormProps {
  type: "create" | "update";
  // For updates, existing data will be passed
  data?: Partial<TeacherAvailabilitySchema> & { id?: string; startTime?: Date; endTime?: Date };
  onClose: () => void; // Function to close the modal or form container
  teacherId?: string; // Needed if an admin is setting this, otherwise derived from authUser
  schoolId?: string;  // Needed if an admin is setting this
}

// Helper to format Date to HH:MM for time input
const formatTimeForInput = (date?: Date | string): string => {
  if (!date) return "";
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (error) {
    console.error("Error formatting date to time string:", error);
    return "";
  }
};

const TeacherAvailabilityForm = ({
  type,
  data,
  onClose,
  // teacherId, // Not directly used in form submission data if teacher self-serves
  // schoolId,  // Not directly used in form submission data if teacher self-serves
}: TeacherAvailabilityFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TeacherAvailabilitySchema>({
    resolver: zodResolver(teacherAvailabilitySchema),
    defaultValues: {
      id: data?.id ?? undefined,
      dayOfWeek: data?.dayOfWeek ?? Day.MONDAY,
      startTime: data?.startTime ? formatTimeForInput(data.startTime) : "09:00",
      endTime: data?.endTime ? formatTimeForInput(data.endTime) : "17:00",
      notes: data?.notes ?? "",
      // teacherId and schoolId are not part of the form fields users fill,
      // they are added in the server action.
    },
  });

  const actionToCall = type === "create" ? createTeacherAvailability : updateTeacherAvailability;
  const [state, formAction] = useFormState(actionToCall, {
    success: false,
    error: false,
    message: "",
  });

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || `Availability ${type === "create" ? "created" : "updated"} successfully!`);
      reset(); // Reset form
      onClose(); // Close modal/form
      router.refresh(); // Refresh the page to show new data
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose, reset]);

  const onSubmit = (formData: TeacherAvailabilitySchema) => {
    let submissionData: any = formData;
    if (type === 'update' && data?.id) {
        submissionData = { ...formData, id: data.id };
    }
    formAction(submissionData);
  };

  return (
    <form className="flex flex-col gap-6 p-1" onSubmit={handleSubmit(onSubmit)}>
      <h2 className="text-xl font-semibold text-gray-800">
        {type === "create" ? "Add Unavailable Time Block" : "Update Unavailable Time Block"}
      </h2>

      <div>
        <label htmlFor="dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Day of the Week</label>
        <select
          id="dayOfWeek"
          {...register("dayOfWeek")}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full bg-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          {Object.values(Day).map((day) => (
            <option key={day} value={day}>{day.charAt(0) + day.slice(1).toLowerCase()}</option>
          ))}
        </select>
        {errors.dayOfWeek && <p className="text-xs text-red-500 mt-1">{errors.dayOfWeek.message}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Start Time"
          name="startTime"
          type="time"
          register={register}
          error={errors?.startTime}
        />
        <InputField
          label="End Time"
          name="endTime"
          type="time"
          register={register}
          error={errors?.endTime}
        />
      </div>
      
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
        <textarea
          id="notes"
          {...register("notes")}
          rows={3}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Any specific details, e.g., 'Lunch break', 'Meetings'"
        />
        {errors.notes && <p className="text-xs text-red-500 mt-1">{errors.notes.message}</p>}
      </div>

      <div className="flex justify-end gap-3 mt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : (type === "create" ? "Add Block" : "Save Changes")}
        </button>
      </div>
    </form>
  );
};

export default TeacherAvailabilityForm; 