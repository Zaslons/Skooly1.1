"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScheduleChangeRequestSchema, scheduleChangeRequestSchema, ScheduleChangeTypeZod } from "@/lib/formValidationSchemas";
import { createScheduleChangeRequest } from "@/lib/actions";
import { Day, Lesson, Teacher } from "@prisma/client"; 
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import InputField from "@/components/InputField";
import SelectField from "@/components/SelectField";
import TextareaField from "@/components/TextareaField";
import { Loader2 } from "lucide-react"; // Added for loading state
// Import TeacherLesson from the page component where it's defined
// The path needs to be relative to the current file or use an alias if setup
// Assuming it's in the parent directory's page.tsx for my-schedule
import type { TeacherLesson } from "../../app/(dashboard)/schools/[schoolId]/teacher/my-schedule/page"; 

// Define a more specific type for teachers passed in props
interface TeacherWithSubjects {
  id: string;
  name: string;
  surname: string;
  subjects: { id: number }[];
}

interface ScheduleChangeRequestFormProps {
  lesson: TeacherLesson; // Use TeacherLesson type directly
  schoolId: string;
  requestingTeacherId: string;
  otherTeachers: TeacherWithSubjects[]; // Updated type for otherTeachers
  onFormSubmitSuccess: () => void; // Callback for successful submission
  onCancel: () => void; // Callback for cancellation
}

const ScheduleChangeRequestForm: React.FC<ScheduleChangeRequestFormProps> = ({
  lesson,
  schoolId, // Not directly used in form fields, but available if action needs it differently
  requestingTeacherId, // Also set server-side, but good to have context
  otherTeachers,
  onFormSubmitSuccess,
  onCancel,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting } } = useForm<ScheduleChangeRequestSchema>({
    resolver: zodResolver(scheduleChangeRequestSchema),
    defaultValues: {
      lessonId: lesson.id,
      requestedChangeType: "TIME_CHANGE", // Default to time change
      reason: "",
      proposedDay: lesson.day, // Pre-fill with original lesson day
      // proposedStartTime and proposedEndTime can be pre-filled or left blank
      // proposedSwapTeacherId: undefined,
    },
  });

  // Log errors whenever they change
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("[FORM ERRORS CHANGED] Form validation errors:", JSON.stringify(errors, null, 2));
    }
  }, [errors]);

  const watchedChangeType = watch("requestedChangeType");

  const onSubmit = async (data: ScheduleChangeRequestSchema) => {
    setFormError(null);
    console.log("[FORM ONSUBMIT] Entered onSubmit. isSubmitting:", isSubmitting, "isPending:", isPending);
    console.log("[FORM ONSUBMIT] Form data (validated by Zod):", JSON.stringify(data, null, 2));
    console.log("[FORM ONSUBMIT] Form errors object (should be empty if onSubmit is reached):", errors);

    startTransition(async () => {
      console.log("[FORM TRANSITION] Entered startTransition. isSubmitting:", isSubmitting, "isPending:", isPending);
      try {
        // The action currentState isn't used here, but it's part of the action signature
        const result = await createScheduleChangeRequest({ success: false, error: false }, data);
        console.log("[FORM TRANSITION] Received result from action:", JSON.stringify(result, null, 2));
        if (result.success) {
          toast.success(result.message || "Change request submitted successfully!");
          onFormSubmitSuccess();
          router.refresh(); // Refresh to show updated request list or schedule implications
        } else {
          toast.error(result.message || "Failed to submit change request.");
          setFormError(result.message || "An unknown error occurred.");
        }
      } catch (error) {
        console.error("[FORM TRANSITION] Error during submission transition:", error);
        toast.error("An unexpected error occurred during submission.");
        setFormError("An unexpected error occurred while submitting the request.");
      }
    });
  };

  const dayOptions = Object.values(Day).map(day => ({ value: day, label: day.charAt(0) + day.slice(1).toLowerCase() }));
  
  // Filter teachers based on the lesson's subject
  const lessonSubjectId = lesson.subject?.id; // Get the subject ID from the lesson

  const filteredTeachers = lessonSubjectId
    ? otherTeachers.filter(teacher => 
        teacher.subjects.some(subject => subject.id === lessonSubjectId)
      )
    : otherTeachers; // Fallback to all teachers if lesson subject ID is not found (should not happen)

  const teacherOptions = filteredTeachers.map(t => ({ value: t.id, label: `${t.name} ${t.surname}` }));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-1">
      <h2 className="text-xl font-semibold text-gray-800">
        Request Schedule Change for: <span className="text-indigo-600">{lesson.name}</span>
      </h2>
      <p className="text-sm text-gray-600">
        Original Time: {lesson.day}, {new Date(lesson.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})} - {new Date(lesson.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
      </p>

      {/* Hidden field for lessonId */} 
      <input type="hidden" {...register("lessonId")} value={lesson.id} />

      <SelectField
        label="Request Type"
        id="requestedChangeType"
        name="requestedChangeType"
        register={register}
        options={[
          { value: "TIME_CHANGE", label: "Request Time/Day Change" },
          { value: "SWAP", label: "Request Teacher Swap" },
        ]}
        error={errors.requestedChangeType}
        selectClassName="w-full"
      />

      {watchedChangeType === "TIME_CHANGE" && (
        <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="text-md font-medium text-gray-700 mb-2">Proposed New Time:</h3>
          <SelectField 
            label="Proposed Day"
            id="proposedDay"
            name="proposedDay"
            register={register}
            options={dayOptions}
            error={errors.proposedDay}
            selectClassName="w-full"
          />

          <InputField
            label="Proposed Start Time (HH:MM)"
            type="time"
            register={register}
            name="proposedStartTime"
            error={errors.proposedStartTime}
          />
          <InputField
            label="Proposed End Time (HH:MM)"
            type="time"
            register={register}
            name="proposedEndTime"
            error={errors.proposedEndTime}
          />
        </div>
      )}

      {watchedChangeType === "SWAP" && (
        <div className="space-y-4 p-4 border border-gray-200 rounded-md bg-gray-50">
           <h3 className="text-md font-medium text-gray-700 mb-2">Proposed Swap:</h3>
          <SelectField
            label="Swap With Teacher"
            id="proposedSwapTeacherId"
            name="proposedSwapTeacherId"
            register={register}
            options={teacherOptions}
            error={errors.proposedSwapTeacherId}
            placeholder="Select a teacher..."
            selectClassName="w-full"
          />

        </div>
      )}

      <TextareaField
        label="Reason for Request"
        id="reason"
        name="reason"
        register={register}
        error={errors.reason}
        textareaClassName="w-full min-h-[80px]"
        placeholder="Please provide a brief reason for your request..."
        rows={3}
      />

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button 
          type="button" 
          onClick={onCancel} 
          disabled={isPending || isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          onClick={() => console.log("[SUBMIT BUTTON CLICKED] Submit button was clicked. isSubmitting:", isSubmitting, "isPending:", isPending)}
          disabled={isPending || isSubmitting} 
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {(isPending || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending || isSubmitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </form>
  );
};

export default ScheduleChangeRequestForm; 