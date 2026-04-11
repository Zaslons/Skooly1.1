"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import {
  examSchema,
  ExamSchema,
  subjectSchema,
  SubjectSchema,
} from "@/lib/formValidationSchemas";
import { ExamCategory } from "@prisma/client";
import {
  createExam,
  createSubject,
  updateExam,
  updateSubject,
} from "@/lib/actions";
import { useFormState } from "react-dom";
import { Dispatch, SetStateAction, useEffect } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

// Define the shape of the state returned by the form actions
type ExamFormActionState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const ExamForm = ({
  type,
  data,
  onClose,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  onClose: () => void;
  relatedData?: {
    lessons?: { id: number | string; name: string }[];
    examPeriods?: { id: string; title: string; startDate: Date | string; endDate: Date | string }[];
    termId?: string | null;
  };
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExamSchema>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      title: data?.title ?? "",
      startTime: data?.startTime ? new Date(data.startTime) : undefined,
      endTime: data?.endTime ? new Date(data.endTime) : undefined,
      durationMinutes: data?.durationMinutes ?? 60,
      examPeriodId: data?.examPeriodId ?? "",
      isRecurring: data?.isRecurring ?? false,
      examCategory: data?.examCategory ?? ExamCategory.COURSE_EXAM,
      lessonId: data?.lessonId ?? (data?.lesson?.id ?? ""),
      id: data?.id ?? undefined,
    },
  });

  // AFTER REACT 19 IT'LL BE USEACTIONSTATE

  const [state, formAction] = useFormState<ExamFormActionState, ExamSchema>(
    type === "create" ? createExam : updateExam,
    {
      success: false,
      error: false,
      message: undefined,
    }
  );

  const onSubmit = handleSubmit((data) => {
    console.log(data);
    formAction(data);
  });

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(`Exam has been ${type === "create" ? "created" : "updated"}!`);
      onClose();
      router.refresh();
    } else if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  const { lessons = [], examPeriods = [] } = relatedData || {};
  const formatExamPeriodLabel = (period: { title: string; startDate: Date | string; endDate: Date | string }) => {
    const s = new Date(period.startDate);
    const e = new Date(period.endDate);
    const f = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${period.title} (${f(s)} - ${f(e)})`;
  };

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new exam" : "Update the exam"}
      </h1>

      <p className="text-sm text-gray-600 -mb-2">
        <strong>Pop quiz</strong> links to a lesson and shows a &quot;Quiz: X mins&quot; badge on that lesson in the
        calendar. <strong>Course exam</strong> is a full exam block (also on the calendar as an exam event).
      </p>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/3">
          <label className="text-xs text-gray-500">Assessment type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("examCategory")}
          >
            <option value={ExamCategory.COURSE_EXAM}>Course exam</option>
            <option value={ExamCategory.POP_QUIZ}>Pop quiz (in-class)</option>
          </select>
        </div>
        <InputField
          label="Exam title"
          name="title"
          register={register}
          error={errors?.title}
        />
        <InputField
          label="Start Date"
          name="startTime"
          register={register}
          error={errors?.startTime}
          type="datetime-local"
        />
        <InputField
          label="End Date"
          name="endTime"
          register={register}
          error={errors?.endTime}
          type="datetime-local"
        />
        <InputField
          label="Duration (minutes)"
          name="durationMinutes"
          defaultValue={data?.durationMinutes ?? 60}
          register={register}
          error={errors?.durationMinutes}
          type="number"
        />
        <InputField
          label="Max Score"
          name="maxScore"
          defaultValue={data?.maxScore ?? 100}
          register={register}
          error={errors?.maxScore}
          type="number"
        />
        <InputField
          label="Weight"
          name="weight"
          defaultValue={data?.weight ?? 1.0}
          register={register}
          error={errors?.weight}
          type="number"
        />
        {data && (
          <InputField
            label="Id"
            name="id"
            register={register}
            error={errors?.id}
            hidden
          />
        )}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Lesson</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("lessonId")}
          >
            <option value="">Select Lesson</option>
            {lessons.map((lesson: { id: number | string; name: string }) => (
              <option value={lesson.id} key={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </select>
          {errors.lessonId?.message && (
            <p className="text-xs text-red-400">
              {errors.lessonId.message.toString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Exam Period (optional)</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("examPeriodId")}
            defaultValue={data?.examPeriodId ?? ""}
          >
            <option value="">No linked exam period</option>
            {examPeriods.map((period) => (
              <option value={period.id} key={period.id}>
                {formatExamPeriodLabel(period)}
              </option>
            ))}
          </select>
          {errors.examPeriodId?.message && (
            <p className="text-xs text-red-400">{errors.examPeriodId.message.toString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2 w-full md:w-1/4">
          <input
            id="isRecurring"
            type="checkbox"
            className="h-4 w-4"
            {...register("isRecurring")}
            defaultChecked={Boolean(data?.isRecurring)}
          />
          <label htmlFor="isRecurring" className="text-xs text-gray-600">
            Recurring exam
          </label>
        </div>
      </div>
      {state.error && state.message && (
        <span className="text-red-500">{state.message}</span>
      )}
      {!state.message && state.error && (
        <span className="text-red-500">Something went wrong!</span>
      )}
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ExamForm;
